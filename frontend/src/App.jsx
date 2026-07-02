import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { FileText, MessageSquare, Brain, LogOut, User, Settings, BarChart3 } from 'lucide-react'
import Documents from './pages/Documents'
import Chat from './pages/Chat'
import Login from './pages/Login'
import SettingsPage from './pages/Settings'
import Visualize from './pages/Visualize'
import { ensureValidToken } from './api'
import { getTokenExpCookie } from './utils/cookie'

function isLoggedIn() {
  const exp = getTokenExpCookie()
  if (!exp) return false
  return Date.now() / 1000 < exp
}

function RequireAuth({ children }) {
  const location = useLocation()
  if (!isLoggedIn()) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

function Sidebar({ open, onClose }) {
  const username = localStorage.getItem('username') || 'admin'

  const handleLogout = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST' })
    localStorage.removeItem('username')
    localStorage.removeItem('is_admin')
    window.location.href = '/login'
  }

  const mainLinks = [
    { to: '/documents', icon: FileText, label: '文档管理' },
    { to: '/chat', icon: MessageSquare, label: '知识库对话' },
    { to: '/visualize', icon: BarChart3, label: '知识库可视化' },
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

        <div className="flex items-center gap-2 mx-4 mt-4 px-3 py-2 bg-gray-800 rounded-lg">
          <User className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-300">{username}</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {mainLinks.map(({ to, icon: Icon, label }) => (
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

        <div className="border-t border-gray-800 py-2">
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-4 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-purple-500/15 text-purple-300 font-medium'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`
            }
          >
            <Settings className="w-4 h-4" />
            用户设置
          </NavLink>
        </div>

        <div className="border-t border-gray-800 p-4">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full text-sm text-gray-500 hover:text-gray-300 transition-colors px-3 py-2 rounded-lg hover:bg-gray-800"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </aside>
    </>
  )
}

function ExpiredDialog({ open, onConfirm }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">登录已过期</h2>
        <p className="text-sm text-gray-400 mb-6">
          您的登录状态已过期，请重新登录以继续使用。
        </p>
        <button
          onClick={onConfirm}
          className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          重新登录
        </button>
      </div>
    </div>
  )
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showExpired, setShowExpired] = useState(false)

  useEffect(() => {
    const handler = () => setShowExpired(true)
    window.addEventListener('auth:expired', handler)
    return () => window.removeEventListener('auth:expired', handler)
  }, [])

  useEffect(() => {
    ensureValidToken().catch(() => {})
  }, [])

  const handleExpiredConfirm = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST' })
    localStorage.removeItem('username')
    localStorage.removeItem('is_admin')
    window.location.href = '/login'
  }

  return (
    <div className="flex h-screen">
      <ExpiredDialog open={showExpired} onConfirm={handleExpiredConfirm} />
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
          <Route path="/visualize" element={<Visualize />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
