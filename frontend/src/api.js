import { getTokenExp } from './utils/jwt'

const BASE = '/api/v1'

function handleAuthExpired() {
  window.dispatchEvent(new CustomEvent('auth:expired'))
  throw new Error('认证已过期')
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

let refreshPromise = null

async function doRefresh() {
  const token = localStorage.getItem('token')
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  })
  if (res.status === 401 || res.status === 403) {
    handleAuthExpired()
    return
  }
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  localStorage.setItem('token', data.access_token)
  if (data.username) localStorage.setItem('username', data.username)
  return data.access_token
}

export async function ensureValidToken() {
  const token = localStorage.getItem('token')
  if (!token) return

  const exp = getTokenExp(token)
  if (!exp) return

  const now = Math.floor(Date.now() / 1000)
  if (exp - now > 3600) return

  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  }
  await refreshPromise
}

export async function uploadFile(file, groupName = '') {
  await ensureValidToken()
  const form = new FormData()
  form.append('file', file)
  if (groupName) form.append('group_name', groupName)
  const headers = {}
  const token = localStorage.getItem('token')
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    headers,
    body: form,
  })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listDocuments() {
  await ensureValidToken()
  const res = await fetch(`${BASE}/documents/`, { headers: authHeaders() })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return [] }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteDocument(id) {
  await ensureValidToken()
  const res = await fetch(`${BASE}/documents/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function chatStream(query, onSource, onChunk, onDone, onError) {
  await ensureValidToken()
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  return fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  }).then(async (response) => {
    if (response.status === 401 || response.status === 403) { handleAuthExpired(); return }
    if (!response.ok) { onError(`HTTP ${response.status}`); return }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') { onDone(); return }
          try {
            const json = JSON.parse(data)
            if (json.type === 'sources') { onSource(json.sources) }
            else if (json.choices?.[0]?.delta?.content) {
              onChunk(json.choices[0].delta.content)
            }
            else if (json.error) { onError(json.error) }
          } catch { /* ignore parse errors */ }
        }
      }
    }
    onDone()
  }).catch(err => onError(err.message))
}

// ── Admin APIs ──────────────────────────────────────────

export async function getSystemConfig() {
  await ensureValidToken()
  const res = await fetch(`${BASE}/admin/config`, { headers: authHeaders() })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return null }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateSystemConfig(data) {
  await ensureValidToken()
  const res = await fetch(`${BASE}/admin/config`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listUsers() {
  await ensureValidToken()
  const res = await fetch(`${BASE}/admin/users`, { headers: authHeaders() })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return [] }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createUser(data) {
  await ensureValidToken()
  const res = await fetch(`${BASE}/admin/users`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateUser(id, data) {
  await ensureValidToken()
  const res = await fetch(`${BASE}/admin/users/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteUser(id) {
  await ensureValidToken()
  const res = await fetch(`${BASE}/admin/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listGroups() {
  await ensureValidToken()
  const res = await fetch(`${BASE}/admin/groups`, { headers: authHeaders() })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return [] }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Visualization APIs ────────────────────────────────────

export async function fetchEmbeddings() {
  await ensureValidToken()
  const res = await fetch(`${BASE}/viz/embeddings`, { headers: authHeaders() })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return null }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function searchSimilarity(query) {
  await ensureValidToken()
  const res = await fetch(`${BASE}/viz/similarity`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ query }),
  })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return null }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchAnalytics() {
  await ensureValidToken()
  const res = await fetch(`${BASE}/viz/analytics`, { headers: authHeaders() })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return null }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateDocumentGroup(id, groupName) {
  await ensureValidToken()
  const res = await fetch(`${BASE}/admin/documents/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ group_name: groupName || null }),
  })
  if (res.status === 401 || res.status === 403) { handleAuthExpired(); return }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
