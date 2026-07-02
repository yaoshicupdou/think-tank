import { useState, useEffect, useCallback } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import { fetchEmbeddings, searchSimilarity } from '../api'

const COLORS = [
  '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6',
  '#fb923c', '#818cf8', '#2dd4bf', '#e879f9', '#f87171',
]

function Visualize() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchEmbeddings().then(d => {
      if (d) setData(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    const r = await searchSimilarity(query)
    if (r) setResults(r.results)
    setSearching(false)
  }, [query])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  const scatterOption = data ? {
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
    legend: {
      data: data.documents.map(d => d.filename),
      textStyle: { color: '#9ca3af', fontSize: 11 },
      top: 8,
    },
    grid: { top: 40, right: 16, bottom: 24, left: 40 },
    xAxis: { show: false },
    yAxis: { show: false },
    series: data.documents.map((doc, i) => ({
      name: doc.filename,
      type: 'scatter',
      data: data.points
        .filter(p => p.filename === doc.filename)
        .map(p => [p.x, p.y, p.id, p.page_num, p.filename, p.content_preview]),
      symbolSize: 8,
      itemStyle: { color: COLORS[i % COLORS.length], opacity: 0.85 },
      emphasis: { scale: 1.8 },
    })),
  } : null

  const barOption = results ? {
    tooltip: {
      formatter: (p) => {
        const r = results[p.dataIndex]
        return `<div style="max-width:350px"><b>${r.filename}</b> p${r.page_num}<br/>相似度: ${r.similarity}<br/>${r.content_preview}</div>`
      },
      backgroundColor: 'rgba(17,24,39,0.95)',
      borderColor: '#4b5563',
      textStyle: { color: '#e5e7eb', fontSize: 12 },
    },
    grid: { left: 6, right: 6, top: 4, bottom: 4 },
    xAxis: {
      type: 'value',
      max: 1,
      show: false,
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: results.map(r => `${r.filename.substring(0, 12)}...`),
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: results.map(r => r.similarity),
      itemStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [{ offset: 0, color: '#8b5cf6' }, { offset: 1, color: '#3b82f6' }] },
        borderRadius: [0, 4, 4, 0],
      },
      barMaxWidth: 18,
      label: { show: true, position: 'right', color: '#d1d5db', fontSize: 10, formatter: p => p.value.toFixed(3) },
    }],
  } : null

  const onChartClick = (e) => {
    if (e.data) {
      const point = data.points.find(p => p.id === e.data[2])
      if (point) setSelected(point)
    }
  }

  const onBarClick = (e) => {
    const r = results[e.dataIndex]
    if (r) setSelected(r)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    )
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

      <div className="flex gap-4" style={{ height: 'calc(100vh - 140px)' }}>
        {/* Scatter plot */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm text-gray-400">语义空间分布 · {data.points.length} 个片段</h2>
            <span className="text-xs text-gray-600">PCA 降维 1024→2D</span>
          </div>
          <div className="flex-1">
            <ReactECharts
              option={scatterOption}
              style={{ height: '100%', width: '100%' }}
              onEvents={{ click: onChartClick }}
              opts={{ renderer: 'canvas' }}
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="w-80 flex flex-col space-y-3 shrink-0">
          {/* Search */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm text-gray-400 mb-3">相似度搜索</h2>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入查询词..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={handleSearch}
                disabled={searching || !query.trim()}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Results bar chart */}
          {results && results.length > 0 && (
            <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col min-h-0">
              <h2 className="text-sm text-gray-400 mb-2">Top {results.length} 相似片段</h2>
              <div className="flex-1">
                <ReactECharts
                  option={barOption}
                  style={{ height: '100%', width: '100%' }}
                  onEvents={{ click: onBarClick }}
                  opts={{ renderer: 'canvas' }}
                />
              </div>
            </div>
          )}

          {results && results.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-sm text-gray-500">无匹配结果</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelected(null)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-lg w-full mx-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-200">Chunk #{selected.id}</h3>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              <p>文档：{selected.filename} · 第 {selected.page_num} 页</p>
              {selected.similarity !== undefined && (
                <p className="text-purple-400">相似度：{selected.similarity}</p>
              )}
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
