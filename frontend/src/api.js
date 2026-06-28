const BASE = '/api/v1'

function headers() {
  const key = localStorage.getItem('api_key') || ''
  return { 'X-API-Key': key, 'Content-Type': 'application/json' }
}

export async function uploadFile(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    headers: { 'X-API-Key': localStorage.getItem('api_key') || '' },
    body: form,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listDocuments() {
  const res = await fetch(`${BASE}/documents/`, { headers: headers() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteDocument(id) {
  const res = await fetch(`${BASE}/documents/${id}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function chatStream(query, onSource, onChunk, onDone, onError) {
  const key = localStorage.getItem('api_key') || ''
  return fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  }).then(async (response) => {
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
