import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BROWSER_IDENTITY_PREFIX, BROWSER_IDENTITY_MAX_AGE, clearBrowserAnalyticsIdentities,
  loadBrowserAnalyticsIdentity, removeBrowserAnalyticsIdentity } from './browserAnalyticsIdentity'

const day = 24 * 60 * 60 * 1000
let allowed = true
let consentExpiresAt: number
const load = (project = 'project-a') => loadBrowserAnalyticsIdentity(project, () => consentExpiresAt - Date.now(), () => allowed)

beforeEach(() => {
  localStorage.clear()
  allowed = true
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-11T00:00:00Z'))
  consentExpiresAt = Date.now() + BROWSER_IDENTITY_MAX_AGE
  let tail = Promise.resolve<unknown>(undefined)
  vi.stubGlobal('navigator', { locks: { request: (_name: string, callback: () => unknown) => {
    const next = tail.then(callback)
    tail = next
    return next
  } } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('재방문과 동시에 처음 실행한 두 탭은 같은 ID를 사용하며 보관기간을 늘리지 않는다', async () => {
  const [first, second] = await Promise.all([load(), load()])
  expect(first?.id).toBeTruthy()
  expect(second).toEqual(first)
  expect(first?.expiresAt).toBe(Date.now() + 180 * day)
  vi.setSystemTime(Date.now() + day)
  consentExpiresAt = Date.now() + BROWSER_IDENTITY_MAX_AGE
  expect(await load()).toEqual(first)
})

it('프로젝트와 만료된 저장값은 별도 ID로 구분한다', async () => {
  const first = await load()
  expect((await load('project-b'))?.id).not.toBe(first?.id)
  vi.setSystemTime(Date.now() + BROWSER_IDENTITY_MAX_AGE)
  consentExpiresAt = Date.now() + BROWSER_IDENTITY_MAX_AGE
  expect((await load())?.id).not.toBe(first?.id)
})

it('동의 전에는 ID를 만들지 않으며 잠금 대기 중 철회해도 저장하지 않는다', async () => {
  allowed = false
  expect(await load()).toBeNull()
  expect(localStorage.length).toBe(0)
  allowed = true
  const pending = load()
  allowed = false
  expect(await pending).toBeNull()
  expect(localStorage.length).toBe(0)
})

it('현재 동의가 더 빨리 만료되면 저장 기한을 줄이고 이후 허용으로 늘리지 않는다', async () => {
  const first = await load()
  consentExpiresAt = Date.now() + day
  expect(await load()).toEqual({ ...first, expiresAt: consentExpiresAt })
  consentExpiresAt += 180 * day
  expect((await load())?.expiresAt).toBe(first!.createdAt + day)
})

it('만료 정리는 유효 ID와 업무 저장소를 유지하고 철회 정리는 모든 분석 ID를 폐기한다', async () => {
  const first = await load()
  localStorage.setItem('application-preference', 'keep')
  localStorage.setItem(`${BROWSER_IDENTITY_PREFIX}expired`, JSON.stringify({ ...first, createdAt: Date.now() - day, expiresAt: Date.now() }))
  clearBrowserAnalyticsIdentities(true)
  expect(localStorage.getItem(`${BROWSER_IDENTITY_PREFIX}expired`)).toBeNull()
  expect(localStorage.getItem(`${BROWSER_IDENTITY_PREFIX}project-a`)).not.toBeNull()
  clearBrowserAnalyticsIdentities()
  expect(localStorage.getItem(`${BROWSER_IDENTITY_PREFIX}project-a`)).toBeNull()
  expect(localStorage.getItem('application-preference')).toBe('keep')
})

it('이전 탭의 만료 처리는 다른 탭이 새로 만든 ID를 삭제하지 않는다', async () => {
  const first = await load()
  clearBrowserAnalyticsIdentities()
  const second = await load()
  await removeBrowserAnalyticsIdentity('project-a', first!.id)
  expect((await load())?.id).toBe(second!.id)
  await removeBrowserAnalyticsIdentity('project-a', second!.id)
  expect(localStorage.getItem(`${BROWSER_IDENTITY_PREFIX}project-a`)).toBeNull()
})

it('손상된 ID는 대체하고 저장이 차단되면 임시 ID로 수집하지 않는다', async () => {
  localStorage.setItem(`${BROWSER_IDENTITY_PREFIX}project-a`, '{broken')
  expect((await load())?.id).toMatch(/^[a-f0-9-]{36}$/)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(await load()).toBeNull()
})
