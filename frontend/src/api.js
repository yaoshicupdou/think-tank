const BASE = '/api/v1'

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export async function uploadFile(file) {
  const form = new FormData()
  form.append('file', file)
  const headers = {}
  const token = localStorage.getItem('token')
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    headers,
    body: form,
  })
  if (res.status === 401) { window.location.href = '/login'; return }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listDocuments() {
  const res = await fetch(`${BASE}/documents/`, { headers: authHeaders() })
  if (res.status === 401) { window.location.href = '/login'; return [] }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteDocument(id) {
  const res = await fetch(`${BASE}/documents/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (res.status === 401) { window.location.href = '/login'; return }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function chatStream(query, onSource, onChunk, onDone, onError) {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  return fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  }).then(async (response) => {
    if (response.status === 401) { window.location.href = '/login'; return }
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
