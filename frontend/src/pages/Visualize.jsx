import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Search, X, ScatterChart, Grid3X3, GitGraph, TreePine, Cloud } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import 'echarts-wordcloud'
import { fetchEmbeddings, searchSimilarity, fetchAnalytics } from '../api'

const COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#fb923c', '#818cf8', '#2dd4bf', '#e879f9', '#f87171']

const TABS = [
  { key: 'scatter', icon: ScatterChart, label: '散点图' },
  { key: 'heatmap', icon: Grid3X3, label: '热力图' },
  { key: 'network', icon: GitGraph, label: '网络图' },
  { key: 'dendrogram', icon: TreePine, label: '树状图' },
  { key: 'wordcloud', icon: Cloud, label: '词云' },
]

function buildDendrogramTree(docs, merges) {
  if (!merges) return null
  const nodes = {}
  docs.forEach((name, i) => { nodes[i] = { name, children: [] } })
  merges.forEach(m => {
    nodes[m.nodeId] = {
      name: '',
      children: [nodes[m.child1], nodes[m.child2]].filter(Boolean),
    }
  })
  const last = merges[merges.length - 1]
  return nodes[last.nodeId]
}

function dendrogramToECharts(node) {
  if (!node.children || node.children.length === 0) return { name: node.name }
  return {
    name: node.name || '',
    children: node.children.map(dendrogramToECharts),
  }
}

function Visualize() {
  const [data, setData] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('scatter')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    Promise.all([
      fetchEmbeddings().then(d => { if (d) setData(d) }),
      fetchAnalytics().then(a => { if (a) setAnalytics(a) }),
    ]).finally(() => setLoading(false))
  }, [])

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    const r = await searchSimilarity(query)
    if (r) setResults(r.results)
    setSearching(false)
  }, [query])

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch() }

  // ── Scatter chart option ──
  const scatterOption = useMemo(() => {
    if (!data) return null
    return {
      tooltip: {
        formatter: (p) => {
          if (!p.data) return ''
          const d = p.data
          return `<div style="max-width:320px"><b>${d[4]}</b> p${d[3]}<br/>${d[5] || ''}</div>`
        },
        backgroundColor: 'rgba(17,24,39,0.95)',
        borderColor: '#4b5563',
        textStyle: { color: '#e5e7eb', fontSize: 12 },
      },
      legend: { data: data.documents.map(d => d.filename), textStyle: { color: '#9ca3af', fontSize: 11 }, top: 8 },
      grid: { top: 40, right: 16, bottom: 24, left: 40 },
      xAxis: { show: false },
      yAxis: { show: false },
      series: data.documents.map((doc, i) => ({
        name: doc.filename,
        type: 'scatter',
        data: data.points.filter(p => p.filename === doc.filename).map(p => [p.x, p.y, p.id, p.page_num, p.filename, p.content_preview]),
        symbolSize: 8,
        itemStyle: { color: COLORS[i % COLORS.length], opacity: 0.85 },
        emphasis: { scale: 1.8 },
      })),
    }
  }, [data])

  // ── Heatmap option ──
  const heatmapOption = useMemo(() => {
    if (!analytics?.heatmap) return null
    const { documents, matrix } = analytics.heatmap
    const shortened = documents.map(d => d.length > 18 ? d.substring(0, 16) + '..' : d)
    const hmData = []
    for (let i = 0; i < documents.length; i++) {
      for (let j = 0; j < documents.length; j++) {
        hmData.push([j, i, matrix[i][j]])
      }
    }
    return {
      tooltip: {
        formatter: (p) => {
          const [x, y, v] = p.data
          return `${documents[y]}<br/>${documents[x]}<br/>相似度: ${v.toFixed(4)}`
        },
        backgroundColor: 'rgba(17,24,39,0.95)',
        borderColor: '#4b5563',
        textStyle: { color: '#e5e7eb', fontSize: 12 },
      },
      grid: { left: 140, right: 40, top: 20, bottom: 80 },
      xAxis: { type: 'category', data: shortened, axisLabel: { color: '#9ca3af', fontSize: 10, rotate: 40, interval: 0 }, position: 'bottom' },
      yAxis: { type: 'category', data: shortened, axisLabel: { color: '#9ca3af', fontSize: 10 } },
      visualMap: { min: 0.6, max: 1, inRange: { color: ['#1e293b', '#4c1d95', '#7c3aed', '#a78bfa', '#fbbf24'] }, textStyle: { color: '#9ca3af' }, right: 0, bottom: 20 },
      series: [{ type: 'heatmap', data: hmData, label: { show: true, color: '#d1d5db', fontSize: 10, formatter: p => p.data[2].toFixed(3) } }],
    }
  }, [analytics])

  // ── Network graph option ──
  const networkOption = useMemo(() => {
    if (!analytics?.network) return null
    const { nodes, edges } = analytics.network
    if (nodes.length === 0) return null

    const docSet = [...new Set(nodes.map(n => n.filename))]
    const categories = docSet.map((name, i) => ({ name, itemStyle: { color: COLORS[i % COLORS.length] } }))
    const catMap = {}
    docSet.forEach((n, i) => { catMap[n] = i })

    return {
      tooltip: {
        formatter: (p) => {
          if (p.dataType === 'edge') return `相似度: ${p.data.value}`
          const n = p.data
          return `<div style="max-width:260px"><b>${n.filename}</b> p${n.page_num}<br/>${n.content_preview || ''}</div>`
        },
        backgroundColor: 'rgba(17,24,39,0.95)',
        borderColor: '#4b5563',
        textStyle: { color: '#e5e7eb', fontSize: 12 },
      },
      legend: { data: docSet.map(d => d.length > 16 ? d.substring(0, 14) + '..' : d), textStyle: { color: '#9ca3af', fontSize: 10 }, top: 8 },
      series: [{
        type: 'graph', layout: 'force', roam: true, draggable: true,
        force: { repulsion: 200, edgeLength: [60, 200], gravity: 0.05 },
        categories,
        data: nodes.map(n => ({ name: String(n.id), x: n.x * 120, y: n.y * 120, filename: n.filename, page_num: n.page_num, content_preview: n.content_preview, category: catMap[n.filename], symbolSize: 6 })),
        edges: edges.map(e => ({ source: String(e.source), target: String(e.target), value: e.value })),
        lineStyle: { color: '#4b5563', curveness: 0.1, opacity: 0.4 },
        emphasis: { focus: 'adjacency', lineStyle: { width: 2, opacity: 0.7 } },
      }],
    }
  }, [analytics])

  // ── Dendrogram option ──
  const dendrogramOption = useMemo(() => {
    if (!analytics?.dendrogram || !analytics?.heatmap) return null
    const tree = buildDendrogramTree(analytics.heatmap.documents, analytics.dendrogram)
    if (!tree) return null
    const echartsTree = dendrogramToECharts(tree)
    return {
      tooltip: { formatter: p => p.name || '...', backgroundColor: 'rgba(17,24,39,0.95)', borderColor: '#4b5563', textStyle: { color: '#e5e7eb', fontSize: 12 } },
      series: [{
        type: 'tree', data: [echartsTree], top: 10, left: 60, bottom: 10, right: 60,
        symbolSize: 8, orient: 'LR',
        label: { color: '#d1d5db', fontSize: 11 },
        leaves: { label: { color: '#a78bfa', fontSize: 12 } },
        expandAndCollapse: false,
        lineStyle: { color: '#4b5563' },
        itemStyle: { color: '#818cf8' },
      }],
    }
  }, [analytics])

  // ── Word cloud option ──
  const wordcloudOption = useMemo(() => {
    if (!analytics?.wordcloud?.length) return null
    return {
      tooltip: { show: false },
      series: [{
        type: 'wordCloud',
        shape: 'circle',
        sizeRange: [14, 48],
        rotationRange: [-30, 30],
        width: '100%',
        height: '100%',
        drawOutOfBound: false,
        textStyle: {
          fontFamily: 'sans-serif',
          fontWeight: 'bold',
          color: () => COLORS[Math.floor(Math.random() * COLORS.length)],
        },
        emphasis: { textStyle: { color: '#fff', fontSize: 52 } },
        data: analytics.wordcloud.slice(0, 100),
      }],
    }
  }, [analytics])

  const onScatterClick = (e) => {
    if (e.data && data) {
      const point = data.points.find(p => p.id === e.data[2])
      if (point) setSelected(point)
    }
  }

  const onBarClick = (e) => {
    const r = results?.[e.dataIndex]
    if (r) setSelected(r)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-purple-400 animate-spin" /></div>
  }

  if (!data || data.points.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">知识库可视化</h1>
        <p className="text-gray-500 text-sm">暂无可访问的向量数据，请先上传文档。</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">知识库可视化</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition-colors ${
              tab === key ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Main chart area */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col">
          {tab === 'scatter' && scatterOption && (
            <ReactECharts option={scatterOption} style={{ height: '100%', width: '100%' }} onEvents={{ click: onScatterClick }} opts={{ renderer: 'canvas' }} />
          )}
          {tab === 'heatmap' && heatmapOption && (
            <ReactECharts option={heatmapOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
          )}
          {tab === 'network' && networkOption && (
            <ReactECharts option={networkOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
          )}
          {tab === 'dendrogram' && (dendrogramOption ? (
            <ReactECharts option={dendrogramOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
          ) : (
            <p className="text-gray-500 text-sm self-center mt-20">需要至少 2 个文档才能生成树状图</p>
          ))}
          {tab === 'wordcloud' && wordcloudOption && (
            <ReactECharts option={wordcloudOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
          )}
        </div>

        {/* Right search panel — only on scatter tab */}
        {tab === 'scatter' && (
          <div className="w-80 flex flex-col space-y-3 shrink-0">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h2 className="text-sm text-gray-400 mb-3">相似度搜索</h2>
              <div className="flex gap-2">
                <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="输入查询词..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
                <button onClick={handleSearch} disabled={searching || !query.trim()}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {results && results.length > 0 && (
              <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col min-h-0">
                <h2 className="text-sm text-gray-400 mb-2">Top {results.length} 相似片段</h2>
                <div className="flex-1">
                  <ReactECharts
                    option={{
                      tooltip: { formatter: (p) => {
                        const r = results?.[p.dataIndex]
                        return `<div style="max-width:350px"><b>${r?.filename}</b> p${r?.page_num}<br/>相似度: ${r?.similarity}<br/>${r?.content_preview}</div>`
                      }, backgroundColor: 'rgba(17,24,39,0.95)', borderColor: '#4b5563', textStyle: { color: '#e5e7eb', fontSize: 12 } },
                      grid: { left: 6, right: 6, top: 4, bottom: 4 },
                      xAxis: { type: 'value', max: 1, show: false },
                      yAxis: { type: 'category', inverse: true, data: results.map(r => (r.filename?.substring(0, 12) || '') + '...'), axisLabel: { color: '#9ca3af', fontSize: 10 }, axisTick: { show: false } },
                      series: [{ type: 'bar', data: results.map(r => r.similarity), itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#8b5cf6' }, { offset: 1, color: '#3b82f6' }] }, borderRadius: [0, 4, 4, 0] }, barMaxWidth: 18, label: { show: true, position: 'right', color: '#d1d5db', fontSize: 10, formatter: p => p.value.toFixed(3) } }],
                    }}
                    style={{ height: '100%', width: '100%' }}
                    onEvents={{ click: onBarClick }}
                    opts={{ renderer: 'canvas' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail popup */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelected(null)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-lg w-full mx-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-200">Chunk #{selected.id}</h3>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              <p>文档：{selected.filename} · 第 {selected.page_num} 页</p>
              {selected.similarity !== undefined && <p className="text-purple-400">相似度：{selected.similarity}</p>}
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-300 max-h-60 overflow-y-auto whitespace-pre-wrap">
              {selected.content || selected.content_preview}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Visualize
