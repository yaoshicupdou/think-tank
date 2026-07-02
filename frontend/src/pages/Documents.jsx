import { useState, useEffect, useCallback, useRef } from 'react'
import { Upload, FileText, Trash2, Loader2, CheckCircle, XCircle, Clock, X } from 'lucide-react'
import { listDocuments, uploadFile, deleteDocument, listGroups } from '../api'

const statusIcon = {
  completed: <CheckCircle className="w-4 h-4 text-green-400" />,
  processing: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />,
  pending: <Clock className="w-4 h-4 text-yellow-400" />,
  failed: <XCircle className="w-4 h-4 text-red-400" />,
}

const statusText = {
  completed: '已完成',
  processing: '处理中',
  pending: '等待中',
  failed: '失败',
}

function Documents() {
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const fileRef = useRef(null)

  const loadDocs = useCallback(async () => {
    try {
      setDocs(await listDocuments())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  const openDialog = () => {
    listGroups().then(g => setGroups(g || [])).catch(() => {})
    setSelectedGroup('')
    setSelectedFile(null)
    setError('')
    setShowDialog(true)
  }

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files?.[0] || null)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setError('')
    try {
      await uploadFile(selectedFile, selectedGroup)
      setShowDialog(false)
      await loadDocs()
      setTimeout(loadDocs, 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteDocument(id)
      await loadDocs()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">文档管理</h1>
        <button
          onClick={openDialog}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors"
        >
          <Upload className="w-4 h-4" />
          上传文档
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Upload dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDialog(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-200">上传文档</h3>
              <button onClick={() => setShowDialog(false)} className="text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">可访问的用户分组</label>
              <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500">
                <option value="">公开（所有用户可见）</option>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">选择文件</label>
              <input ref={fileRef} type="file" onChange={handleFileChange}
                accept=".pdf,.txt,.md,.doc,.docx"
                className="w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600 file:cursor-pointer" />
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? '上传中...' : '确认上传'}
            </button>
          </div>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500">暂无文档，点击上方按钮上传</p>
          <p className="text-gray-600 text-xs mt-2">支持 PDF、TXT、Markdown、Word</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id}
              className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 animate-fade-in">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-gray-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 truncate">{doc.filename}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(doc.created_at).toLocaleDateString('zh-CN', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  {statusIcon[doc.status]}
                  {statusText[doc.status] || doc.status}
                </span>
                <button onClick={() => handleDelete(doc.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-600 text-center pt-4">
        上传后文档会自动分片并生成向量索引，处理完成后即可在「知识库对话」中提问
      </p>
    </div>
  )
}

export default Documents
