import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Loader2, Check, Trash2, UserPlus, Shield } from 'lucide-react'
import { ensureValidToken, getSystemConfig, updateSystemConfig, listUsers, createUser, updateUser, deleteUser } from '../api'

const isAdmin = () => localStorage.getItem('is_admin') === '1'

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm rounded-lg transition-colors ${
        active
          ? 'bg-purple-600 text-white'
          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  )
}

// ── Tab 1: 修改密码 ─────────────────────────────────────
function PasswordTab() {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdErr, setPwdErr] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!oldPwd || !newPwd) return
    if (newPwd.length < 3) { setPwdErr('密码至少 3 位'); return }
    setSaving(true)
    setPwdMsg('')
    setPwdErr('')
    try {
      await ensureValidToken()
      const token = localStorage.getItem('token')
      const res = await fetch('/api/v1/auth/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '请求失败')
      setPwdMsg('密码修改成功，下次登录请使用新密码')
      setOldPwd('')
      setNewPwd('')
    } catch (err) {
      setPwdErr(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
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
        <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">新密码</label>
        <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
      </div>
      <button type="submit" disabled={saving || !oldPwd || !newPwd}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        修改密码
      </button>
    </form>
  )
}

// ── Tab 2: 系统设置（Admin only）─────────────────────────
function SystemTab() {
  const [cfg, setCfg] = useState({ token_expire_hours: '24', llm_model: '', llm_base_url: '', llm_api_key: '' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getSystemConfig().then(data => {
      if (data) setCfg(data)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      await updateSystemConfig(cfg)
      setMsg('配置已更新')
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <div className="text-gray-500 text-sm p-5">加载中...</div>

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
      <h2 className="text-sm font-medium text-gray-300">系统设置</h2>

      {msg && <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-sm text-green-400 flex items-center gap-2"><Check className="w-3.5 h-3.5" /> {msg}</div>}
      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">{err}</div>}

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Token 有效期（小时）</label>
        <input type="number" value={cfg.token_expire_hours} onChange={e => setCfg({ ...cfg, token_expire_hours: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">大模型名称</label>
        <input type="text" value={cfg.llm_model} onChange={e => setCfg({ ...cfg, llm_model: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">API 地址</label>
        <input type="text" value={cfg.llm_base_url} onChange={e => setCfg({ ...cfg, llm_base_url: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">API 密钥（留空不修改）</label>
        <input type="password" value={cfg.llm_api_key} onChange={e => setCfg({ ...cfg, llm_api_key: e.target.value })}
          placeholder="****"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
      </div>
      <button type="submit" disabled={saving}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        保存配置
      </button>
    </form>
  )
}

// ── Tab 3: 用户管理（Admin only）─────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', is_admin: false, can_upload: true, group_name: '' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const loadUsers = () => {
    listUsers().then(data => { if (data) setUsers(data); setLoaded(true) }).catch(() => setLoaded(true))
  }
  useEffect(loadUsers, [])

  const openCreate = () => {
    setEditUser(null)
    setForm({ username: '', password: '', is_admin: false, can_upload: true, group_name: '' })
    setShowForm(true)
    setMsg('')
    setErr('')
  }

  const openEdit = (u) => {
    setEditUser(u)
    setForm({ username: u.username, password: '', is_admin: u.is_admin, can_upload: u.can_upload, group_name: u.group_name || '' })
    setShowForm(true)
    setMsg('')
    setErr('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.username) return
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      if (editUser) {
        const payload = { is_admin: form.is_admin, can_upload: form.can_upload, group_name: form.group_name }
        if (form.password) payload.password = form.password
        await updateUser(editUser.id, payload)
        setMsg('用户已更新')
      } else {
        if (!form.password || form.password.length < 3) { setErr('密码至少 3 位'); setSaving(false); return }
        await createUser({ username: form.username, password: form.password, is_admin: form.is_admin, can_upload: form.can_upload, group_name: form.group_name || null })
        setMsg('用户创建成功')
      }
      setShowForm(false)
      loadUsers()
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (u) => {
    if (!confirm(`确定删除用户「${u.username}」吗？`)) return
    try {
      await deleteUser(u.id)
      loadUsers()
    } catch (ex) {
      setErr(ex.message)
    }
  }

  if (!loaded) return <div className="text-gray-500 text-sm p-5">加载中...</div>

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-300">用户列表</h2>
          <button onClick={openCreate}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" /> 添加用户
          </button>
        </div>

        {msg && <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-sm text-green-400 flex items-center gap-2"><Check className="w-3.5 h-3.5" /> {msg}</div>}
        {err && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">{err}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="pb-2 font-normal">用户名</th>
                <th className="pb-2 font-normal">管理员</th>
                <th className="pb-2 font-normal">可上传</th>
                <th className="pb-2 font-normal">分组</th>
                <th className="pb-2 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-800/50 text-gray-300">
                  <td className="py-2.5 flex items-center gap-2">
                    {u.username}
                    {u.is_admin && <Shield className="w-3 h-3 text-purple-400" />}
                  </td>
                  <td className="py-2.5">{u.is_admin ? '是' : '否'}</td>
                  <td className="py-2.5">{u.can_upload ? '是' : '否'}</td>
                  <td className="py-2.5 text-gray-400">{u.group_name || '-'}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(u)} className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-800 transition-colors">编辑</button>
                      <button onClick={() => handleDelete(u)} className="text-gray-500 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-gray-800 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 创建/编辑用户弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
          <form onSubmit={handleSave} className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-sm font-medium text-gray-200">{editUser ? '编辑用户' : '添加用户'}</h3>

            <div>
              <label className="block text-xs text-gray-500 mb-1">用户名</label>
              <input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                disabled={!!editUser}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500 disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">密码{editUser ? '（留空不修改）' : ''}</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={editUser ? '留空不修改' : ''}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">分组</label>
              <input type="text" value={form.group_name} onChange={e => setForm({ ...form, group_name: e.target.value })}
                placeholder="如：技术部（留空=公开）"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input type="checkbox" checked={form.is_admin} onChange={e => setForm({ ...form, is_admin: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-800 accent-purple-500" />
                管理员
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input type="checkbox" checked={form.can_upload} onChange={e => setForm({ ...form, can_upload: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-800 accent-purple-500" />
                可上传
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">取消</button>
              <button type="submit" disabled={saving}
                className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editUser ? '保存' : '创建'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ── 主组件 ───────────────────────────────────────────────
export default function Settings() {
  const [tab, setTab] = useState('password')

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-5 h-5 text-gray-400" />
        <h1 className="text-xl font-semibold">设置</h1>
      </div>

      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800">
        <TabButton active={tab === 'password'} onClick={() => setTab('password')}>个人信息</TabButton>
        {isAdmin() && (
          <>
            <TabButton active={tab === 'system'} onClick={() => setTab('system')}>系统设置</TabButton>
            <TabButton active={tab === 'users'} onClick={() => setTab('users')}>用户管理</TabButton>
          </>
        )}
      </div>

      {tab === 'password' && <PasswordTab />}
      {tab === 'system' && <SystemTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  )
}
