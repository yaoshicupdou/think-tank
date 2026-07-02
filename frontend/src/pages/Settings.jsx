import { useState } from 'react'
import { Settings as SettingsIcon, Loader2, Check } from 'lucide-react'
import { ensureValidToken } from '../api'

function Settings() {
  const [username, setUsername] = useState(localStorage.getItem('username') || '')
  const [usernameMsg, setUsernameMsg] = useState('')
  const [usernameErr, setUsernameErr] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdErr, setPwdErr] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  const authFetch = async (url, opts = {}) => {
    await ensureValidToken()
    const token = localStorage.getItem('token')
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
    }).then(async (res) => {
      if (res.status === 401 || res.status === 403) {
        window.dispatchEvent(new CustomEvent('auth:expired'))
        throw new Error('认证已过期')
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '请求失败')
      return data
    })
  }

  const handleUpdateUsername = async (e) => {
    e.preventDefault()
    if (!username.trim()) return
    setSavingName(true)
    setUsernameMsg('')
    setUsernameErr('')
    try {
      const data = await authFetch('/api/v1/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ username: username.trim() }),
      })
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('username', data.username)
      setUsernameMsg('用户名已更新')
    } catch (err) {
      setUsernameErr(err.message)
    } finally {
      setSavingName(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (!oldPwd || !newPwd) return
    if (newPwd.length < 3) { setPwdErr('密码至少 3 位'); return }
    setSavingPwd(true)
    setPwdMsg('')
    setPwdErr('')
    try {
      await authFetch('/api/v1/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      })
      setPwdMsg('密码修改成功，下次登录请使用新密码')
      setOldPwd('')
      setNewPwd('')
    } catch (err) {
      setPwdErr(err.message)
    } finally {
      setSavingPwd(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-5 h-5 text-gray-400" />
        <h1 className="text-xl font-semibold">用户设置</h1>
      </div>

      {/* 修改用户名 */}
      <form onSubmit={handleUpdateUsername} className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-gray-300">修改用户名</h2>

        {usernameMsg && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-sm text-green-400 flex items-center gap-2">
            <Check className="w-3.5 h-3.5" /> {usernameMsg}
          </div>
        )}
        {usernameErr && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">{usernameErr}</div>
        )}

        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
        />

        <button
          type="submit"
          disabled={savingName || !username.trim()}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          保存
        </button>
      </form>

      {/* 修改密码 */}
      <form onSubmit={handleChangePassword} className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-gray-300">修改密码</h2>

        {pwdMsg && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-sm text-green-400 flex items-center gap-2">
            <Check className="w-3.5 h-3.5" /> {pwdMsg}
          </div>
        )}
        {pwdErr && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">{pwdErr}</div>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">旧密码</label>
          <input
            type="password"
            value={oldPwd}
            onChange={e => setOldPwd(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">新密码</label>
          <input
            type="password"
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
          />
        </div>

        <button
          type="submit"
          disabled={savingPwd || !oldPwd || !newPwd}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          修改密码
        </button>
      </form>
    </div>
  )
}

export default Settings
