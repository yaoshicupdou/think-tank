export function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

export function getTokenExpCookie() {
  const exp = getCookie('token_exp')
  return exp ? parseInt(exp, 10) : null
}
