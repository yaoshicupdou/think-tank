import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Brain, FileText, User } from 'lucide-react'
import { chatStream } from '../api'

function Chat() {
  const [query, setQuery] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [messages, setMessages] = useState([])
  const chatEnd = useRef(null)

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!query.trim() || streaming) return

    const userMsg = { role: 'user', content: query }
    const assistantMsg = { role: 'assistant', content: '', sources: null }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setQuery('')
    setStreaming(true)

    chatStream(
      query,
      (sources) => {
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { ...copy[copy.length - 1], sources }
          return copy
        })
      },
      (chunk) => {
        setMessages(prev => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = { ...last, content: last.content + chunk }
          return copy
        })
      },
      () => setStreaming(false),
      (err) => {
        setMessages(prev => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = { ...last, content: last.content || `错误: ${err}` }
          return copy
        })
        setStreaming(false)
      }
    )
  }

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 && (
          <div className="text-center py-32">
            <Brain className="w-14 h-14 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">基于已上传文档提问，AI 将从知识库中检索相关内容作答</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="animate-fade-in">
            {/* Sources */}
            {msg.sources && msg.sources.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs text-gray-500 font-medium">检索到的参考资料：</p>
                {msg.sources.map((s, j) => (
                  <div key={j} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <FileText className="w-3 h-3" />
                      {s.filename}
                      <span className="text-gray-700">相似度 {(s.similarity * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{s.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Message bubble */}
            <div className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="w-4 h-4 text-purple-400" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-900 border border-gray-800 text-gray-200'
              }`}>
                {msg.role === 'assistant' && msg.content ? (
                  <div className="prose-stream whitespace-pre-wrap">{msg.content}</div>
                ) : msg.role === 'assistant' && streaming ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                ) : msg.role === 'assistant' && !msg.content ? (
                  <span className="text-gray-600">等待回复...</span>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-gray-300" />
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEnd} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 px-6 py-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="输入问题，基于已上传文档回答..."
            disabled={streaming}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!query.trim() || streaming}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Chat
