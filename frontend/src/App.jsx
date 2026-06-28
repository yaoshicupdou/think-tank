import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { FileText, MessageSquare, Brain, KeyRound } from 'lucide-react'
import Documents from './pages/Documents'
import Chat from './pages/Chat'

function Sidebar({ open, onClose }) {
  const links = [
    { to: '/documents', icon: FileText, label: '文档管理' },
    { to: '/chat', icon: MessageSquare, label: '知识库对话' },
  ]

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-50
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-0
        flex flex-col
      `}>
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
          <Brain className="w-7 h-7 text-purple-400" />
          <span className="text-lg font-semibold">Think Tank</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {links.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-purple-500/15 text-purple-300 font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <ApiKeyPanel />
      </aside>
    </>
  )
}

function ApiKeyPanel() {
  const [key, setKey] = useState(localStorage.getItem('api_key') || '')
  const [visible, setVisible] = useState(false)

  const save = () => {
    localStorage.setItem('api_key', key)
    setVisible(false)
  }

  return (
    <div className="border-t border-gray-800 p-4">
      {visible ? (
        <div className="space-y-2">
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="输入 API Key"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg py-1.5 transition-colors">保存</button>
            <button onClick={() => setVisible(false)} className="px-2 py-1.5 text-gray-500 hover:text-gray-300 text-xs">取消</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setVisible(true)}
          className="flex items-center gap-2 w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <KeyRound className="w-3 h-3" />
          {key ? 'API Key 已设置' : '设置 API Key'}
        </button>
      )}
    </div>
  )
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <BrowserRouter>
      <div className="flex h-screen">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-auto">
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-800">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-400 p-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-sm font-medium">Think Tank</span>
          </div>
          <Routes>
            <Route path="/documents" element={<Documents />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
