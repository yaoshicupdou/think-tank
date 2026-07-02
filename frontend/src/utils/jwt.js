export function decodeJWT(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function getTokenExp(token) {
  const payload = decodeJWT(token)
  if (!payload || !payload.exp) return null
  return payload.exp
}
