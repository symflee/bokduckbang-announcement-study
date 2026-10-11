export const BROWSER_IDENTITY_PREFIX = 'toadzip.posthog.browser.v1:'
export const BROWSER_IDENTITY_MAX_AGE = 180 * 24 * 60 * 60 * 1000
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export interface BrowserAnalyticsIdentity { id: string; createdAt: number; expiresAt: number }

function parseIdentity(value: string | null): BrowserAnalyticsIdentity | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Record<string, unknown>
    if (typeof candidate.id !== 'string' || !UUID.test(candidate.id)
      || typeof candidate.createdAt !== 'number' || !Number.isFinite(candidate.createdAt)
      || typeof candidate.expiresAt !== 'number' || !Number.isFinite(candidate.expiresAt)
      || candidate.createdAt > Date.now() || candidate.expiresAt <= Date.now()
      || candidate.expiresAt <= candidate.createdAt
      || candidate.expiresAt - candidate.createdAt > BROWSER_IDENTITY_MAX_AGE) return null
    return { id: candidate.id, createdAt: candidate.createdAt, expiresAt: candidate.expiresAt }
  } catch { return null }
}

export function readBrowserAnalyticsIdentity(projectKey: string): BrowserAnalyticsIdentity | null {
  try { return parseIdentity(localStorage.getItem(`${BROWSER_IDENTITY_PREFIX}${projectKey}`)) }
  catch { return null }
}

/** Only the random browser ID and its fixed lifetime are stored, never consent/account IDs. */
export async function loadBrowserAnalyticsIdentity(
  projectKey: string, remainingConsentLifetime: () => number, allowed: () => boolean,
  onLoaded?: (identity: BrowserAnalyticsIdentity) => void,
): Promise<BrowserAnalyticsIdentity | null> {
  if (!allowed() || !navigator.locks) return null
  const key = `${BROWSER_IDENTITY_PREFIX}${projectKey}`
  try {
    return await navigator.locks.request(key, () => {
      // Permission and expiry may change while another tab holds the lock.
      if (!allowed()) return null
      const remaining = remainingConsentLifetime()
      if (!Number.isFinite(remaining) || remaining <= 0) return null
      const now = Date.now()
      const deadline = Math.floor(now + Math.min(BROWSER_IDENTITY_MAX_AGE, remaining))
      const stored = parseIdentity(localStorage.getItem(key))
      const identity = stored
        ? { ...stored, expiresAt: Math.min(stored.expiresAt, deadline) }
        : { id: crypto.randomUUID(), createdAt: now, expiresAt: deadline }
      if (identity.expiresAt <= now) return null
      localStorage.setItem(key, JSON.stringify(identity))
      onLoaded?.(identity)
      return identity
    })
  } catch { return null }
}

/** An old tab must not delete an ID already replaced by another tab. */
export async function removeBrowserAnalyticsIdentity(projectKey: string, expectedId: string): Promise<void> {
  try {
    const key = `${BROWSER_IDENTITY_PREFIX}${projectKey}`
    const remove = () => {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (value && typeof value === 'object' && Reflect.get(value, 'id') === expectedId) localStorage.removeItem(key)
    }
    if (navigator.locks) await navigator.locks.request(key, remove)
    else remove()
  } catch { /* A storage failure never enables fallback collection. */ }
}

export function clearBrowserAnalyticsIdentities(expiredOnly = false): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(BROWSER_IDENTITY_PREFIX) && (!expiredOnly || !parseIdentity(localStorage.getItem(key)))) localStorage.removeItem(key)
    }
  } catch { /* Collection stays stopped when browser storage is unavailable. */ }
}
