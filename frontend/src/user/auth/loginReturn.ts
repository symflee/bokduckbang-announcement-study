const RETURN_KEY = 'toadzip:login-return-until'
const RETURN_LIFETIME_MS = 15 * 60 * 1000

// The deployed OAuth success URL may still point to /. Only a login started in
// this tab should bypass the landing page; no account or redirect URL is stored.
export function rememberLoginReturn() {
  try {
    sessionStorage.setItem(RETURN_KEY, String(Date.now() + RETURN_LIFETIME_MS))
  } catch {
    // Login remains available when browser storage is restricted.
  }
}

export function hasPendingLoginReturn(): boolean {
  try {
    const expiresAt = Number(sessionStorage.getItem(RETURN_KEY))
    const now = Date.now()
    return Number.isFinite(expiresAt) && expiresAt > now && expiresAt <= now + RETURN_LIFETIME_MS
  } catch {
    return false
  }
}

export function clearLoginReturn() {
  try {
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    // Storage is optional for public exploration.
  }
}
