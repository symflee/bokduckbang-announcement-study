import { StrictMode } from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DetailLocationResult } from '../navigation/detailLocation'
import { useProductDetailAnalytics } from './useProductDetailAnalytics'
import { captureProductEvent } from '../../analytics/productAnalytics'
import { ProductAnalyticsBoundary } from '../../analytics/ProductAnalyticsBoundary'
import type { AnalyticsStopReason } from '../../privacy/consentStore'

const consent = vi.hoisted(() => ({ allowed: true, listeners: new Set<() => void>(),
  stopListeners: new Set<(reason: AnalyticsStopReason) => void>(),
}))
vi.mock('../../privacy/consentStore', () => ({
  analyticsCollectionAllowed: () => consent.allowed,
  consentStore: {
    subscribe(listener: () => void) {
      consent.listeners.add(listener)
      return () => consent.listeners.delete(listener)
    },
    onStop(listener: (reason: AnalyticsStopReason) => void) {
      consent.stopListeners.add(listener)
      return () => consent.stopListeners.delete(listener)
    },
  },
}))
vi.mock('../../analytics/productAnalytics', () => ({
  captureProductEvent: vi.fn(() => consent.allowed),
  createAnalyticsId: () => crypto.randomUUID(),
  setProductPageActive: vi.fn(),
}))
const capture = vi.mocked(captureProductEvent)
const rectangle = { x: 10, y: 10, top: 10, left: 10, bottom: 300, right: 400, width: 390, height: 290, toJSON: () => ({}) }
function Probe({ location, ready }: { location: DetailLocationResult; ready: string | null }) {
  useProductDetailAnalytics({ detailLocation: location,
    readyComplexId: location.kind === 'complex' ? ready : null,
    readyAnnouncementId: location.kind === 'announcement' ? ready : null })
  if (location.kind !== 'complex' && location.kind !== 'announcement') return null
  return <dialog open className="housing-detail-layer" aria-label={location.kind === 'complex' ? '단지 상세' : '공고 상세'}><h2>상세</h2></dialog>
}
const wrap = ({ children }: { children: React.ReactNode }) => <StrictMode><MemoryRouter>{children}</MemoryRouter></StrictMode>
beforeEach(() => {
  consent.allowed = true
  capture.mockClear()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rectangle)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})
afterEach(() => { cleanup(); consent.listeners.clear(); consent.stopListeners.clear(); document.querySelectorAll('[data-test-blocker]').forEach(node => node.remove()); vi.restoreAllMocks() })

function collected(name: string) {
  return capture.mock.calls.filter(([event], index) => event === name && capture.mock.results[index]?.value === true)
}

async function setConsent(allowed: boolean) {
  await act(async () => { consent.allowed = allowed; consent.listeners.forEach(listener => listener()) })
}

function notifyStop(reason: AnalyticsStopReason) {
  consent.allowed = false
  consent.stopListeners.forEach(listener => listener(reason))
  consent.listeners.forEach(listener => listener())
}

describe('제품 활성 상세 계측', () => {
  it.each(['complex', 'announcement'] as const)('%s 상세가 먼저 표시되어도 동의 확인이 끝나면 현재 방문을 한 번 수집한다', async (kind) => {
    consent.allowed = false
    const location: DetailLocationResult = kind === 'complex'
      ? { kind, complexId: '12' } : { kind, announcementId: '12' }
    render(<><ProductAnalyticsBoundary /><Probe location={location} ready="12" /></>, { wrapper: wrap })
    await act(async () => {})
    expect(collected(`view_${kind}`)).toHaveLength(0)

    // Only the consent store changes: the detail, DOM and viewport stay the same.
    await setConsent(true)
    expect(collected('page_view')).toHaveLength(1)
    expect(collected(`view_${kind}`)).toHaveLength(1)
    expect(collected(`view_${kind}`)[0]?.[1]).toMatchObject({ [`${kind}_id`]: '12' })

    await setConsent(false)
    await setConsent(true)
    expect(collected(`view_${kind}`)).toHaveLength(1)
  })

  it('동의 확인 전에 닫은 상세 방문을 나중에 소급 수집하지 않는다', async () => {
    consent.allowed = false
    const view = render(<Probe location={{ kind: 'complex', complexId: '12' }} ready="12" />, { wrapper: wrap })
    await act(async () => {})
    view.rerender(<Probe location={{ kind: 'none' }} ready={null} />)
    await setConsent(true)
    expect(collected('view_complex')).toHaveLength(0)
  })

  it.each(['complex', 'announcement'] as const)('동의가 초기화되면 재동의 후 현재 %s 상세를 새 방문 ID로 한 번 수집한다', async kind => {
    const location: DetailLocationResult = kind === 'complex'
      ? { kind, complexId: '12' } : { kind, announcementId: '12' }
    render(<Probe location={location} ready="12" />, { wrapper: wrap })
    await waitFor(() => expect(collected(`view_${kind}`)).toHaveLength(1))
    const first = collected(`view_${kind}`)[0]

    await act(async () => notifyStop('reset'))
    expect(collected(`view_${kind}`)).toHaveLength(1)
    await setConsent(true)
    expect(collected(`view_${kind}`)).toHaveLength(2)
    const second = collected(`view_${kind}`)[1]
    expect(second?.[1]?.detail_visit_id).not.toBe(first?.[1]?.detail_visit_id)
    expect(second?.[2]?.dedupeKey).not.toBe(first?.[2]?.dedupeKey)

    await setConsent(true)
    await act(async () => window.dispatchEvent(new Event('resize')))
    expect(collected(`view_${kind}`)).toHaveLength(2)
  })

  it('초기화 직후 같은 작업 안에서 새 동의가 확인되어도 현재 상세를 새로 수집한다', async () => {
    render(<Probe location={{ kind: 'complex', complexId: '12' }} ready="12" />, { wrapper: wrap })
    await waitFor(() => expect(collected('view_complex')).toHaveLength(1))
    await act(async () => {
      notifyStop('reset')
      consent.allowed = true
      consent.listeners.forEach(listener => listener())
    })
    expect(collected('view_complex')).toHaveLength(2)
  })

  it('동의 초기화 후 재동의 전에 닫은 상세는 다시 수집하지 않는다', async () => {
    const view = render(<Probe location={{ kind: 'complex', complexId: '12' }} ready="12" />, { wrapper: wrap })
    await waitFor(() => expect(collected('view_complex')).toHaveLength(1))
    await act(async () => notifyStop('reset'))
    view.rerender(<Probe location={{ kind: 'none' }} ready={null} />)
    await setConsent(true)
    expect(collected('view_complex')).toHaveLength(1)
  })

  it.each(['pause', 'context-change'] as const)('%s 후 허용이 복구되어도 같은 상세를 중복 수집하지 않는다', async reason => {
    render(<Probe location={{ kind: 'complex', complexId: '12' }} ready="12" />, { wrapper: wrap })
    await waitFor(() => expect(collected('view_complex')).toHaveLength(1))
    const firstVisit = collected('view_complex')[0]?.[1]?.detail_visit_id
    await act(async () => notifyStop(reason))
    await setConsent(true)
    expect(collected('view_complex')).toHaveLength(1)
    expect(document.querySelector<HTMLElement>('dialog.housing-detail-layer')?.dataset.detailVisitId).toBe(firstVisit)
  })

  it('로드 성공이 다른 팝업 뒤에 있으면 기다리고, 노출 후 재렌더와 반응형 재열기는 한 번만 센다', async () => {
    const blocker = document.createElement('dialog'); blocker.open = true; blocker.dataset.testBlocker = 'true'; document.body.append(blocker)
    const view = render(<Probe location={{ kind: 'complex', complexId: '12' }} ready="12" />, { wrapper: wrap })
    await act(async () => {})
    expect(capture).not.toHaveBeenCalled()
    blocker.remove()
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1))
    expect(capture).toHaveBeenLastCalledWith('view_complex', expect.objectContaining({ complex_id: '12', entry_point: 'direct' }), expect.any(Object))
    const dialog = document.querySelector('dialog.housing-detail-layer') as HTMLDialogElement
    const visit = dialog.dataset.detailVisitId
    await act(async () => { dialog.open = false; dialog.open = true })
    view.rerender(<Probe location={{ kind: 'complex', complexId: '12' }} ready="12" />)
    expect(capture).toHaveBeenCalledTimes(1)
    expect(dialog.dataset.detailVisitId).toBe(visit)
  })
  it('잘못된 타깃 응답과 백그라운드를 세지 않고 닫고 재열면 새 방문으로 센다', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const view = render(<Probe location={{ kind: 'complex', complexId: '12' }} ready="11" />, { wrapper: wrap })
    await act(async () => {})
    expect(capture).not.toHaveBeenCalled()
    view.rerender(<Probe location={{ kind: 'complex', complexId: '12' }} ready="12" />)
    await act(async () => {})
    expect(capture).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(capture).toHaveBeenCalledTimes(1)
    const first = capture.mock.calls[0][1]?.detail_visit_id
    view.rerender(<Probe location={{ kind: 'none' }} ready={null} />)
    view.rerender(<Probe location={{ kind: 'complex', complexId: '12' }} ready="12" />)
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2))
    expect(capture.mock.calls[1][1]?.detail_visit_id).not.toBe(first)
  })
  it('뷰포트 밖 또는 크기 없는 상세는 활성으로 세지 않는다', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...rectangle, width: 0, height: 0 })
    render(<Probe location={{ kind: 'complex', complexId: '12' }} ready="12" />, { wrapper: wrap })
    await act(async () => {})
    expect(capture).not.toHaveBeenCalled()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rectangle)
    await act(async () => window.dispatchEvent(new Event('resize')))
    expect(capture).toHaveBeenCalledTimes(1)
  })
})
