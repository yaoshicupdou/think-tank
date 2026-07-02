import { useState } from 'react'
import { Brain, Loader2 } from 'lucide-react'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const msg = res.status === 401 ? '用户名或密码错误' : '登录失败'
        throw new Error(msg)
      }
      const data = await res.json()
      // Token 由后端通过 httpOnly cookie 自动管理
      localStorage.setItem('username', data.username)
      localStorage.setItem('is_admin', data.is_admin ? '1' : '')
      window.location.href = '/chat'
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Brain className="w-12 h-12 text-purple-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-100">Think Tank</h1>
          <p className="text-sm text-gray-500 mt-1">AI 知识库</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">用户名</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
              placeholder="admin"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
              placeholder="admin"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '登录'}
          </button>
        </form>

        <p className="text-xs text-gray-600 text-center mt-6">
          默认账户 admin / admin
        </p>
      </div>
    </div>
  )
}

export default Login
