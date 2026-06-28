import { useState, useEffect, useCallback } from 'react'
import { Upload, FileText, Trash2, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { listDocuments, uploadFile, deleteDocument } from '../api'

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

  const loadDocs = useCallback(async () => {
    try {
      setDocs(await listDocuments())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await uploadFile(file)
      await loadDocs()
      setTimeout(loadDocs, 3000)  // 等后台处理完再刷新
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
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
        <label className={`
          inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors
          ${uploading ? 'bg-gray-700 text-gray-400' : 'bg-purple-600 hover:bg-purple-700 text-white'}
        `}>
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              上传中...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              上传文档
            </>
          )}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading}
            accept=".pdf,.txt,.md,.doc,.docx" />
        </label>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
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
