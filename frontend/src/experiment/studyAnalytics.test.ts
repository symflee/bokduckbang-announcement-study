import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CaptureResult, PostHogConfig } from 'posthog-js'
import { CONSENT_VERSION, EXPERIMENT_VERSION, QUESTION_VERSION } from './state'
import type { StudyAnalyticsContext } from './studyAnalytics'

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(), sessionRecordingStarted: vi.fn(), set_config: vi.fn() }))
const constructor = vi.hoisted(() => vi.fn())
vi.mock('posthog-js/full/no-external', () => ({ PostHog: function () { constructor(); return sdk } }))

function context(overrides: Partial<StudyAnalyticsContext> = {}): StudyAnalyticsContext {
  return { sessionId: 'random-study-session', experimentVersion: EXPERIMENT_VERSION, questionVersion: QUESTION_VERSION,
    datasetVersion: 'study-data-v1', order: ['old', 'new'], test: true, screen: 'desktop', phase: 'warmup', method: null,
    consent: { version: CONSENT_VERSION, acceptedAt: '2026-10-15T04:00:00.000Z' }, ...overrides }
}
function options(): Partial<PostHogConfig> { return sdk.init.mock.calls[0][1] }
function filterEvent(event: string, properties: Record<string, unknown>) {
  const value: CaptureResult = { event, properties: { token: 'phc_studytest', ...properties }, uuid: '00000000-0000-4000-8000-000000000001', timestamp: new Date(),
    $set: { email: 'contact@example.com' }, $set_once: { referrer: window.location.href } }
  const beforeSend = options().before_send
  if (typeof beforeSend !== 'function') throw new Error('Missing event privacy boundary')
  return beforeSend(value)
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('VITE_STUDY_POSTHOG_KEY', 'phc_studytest')
  vi.stubEnv('VITE_STUDY_POSTHOG_HOST', 'https://us.i.posthog.com')
  sessionStorage.clear()
  localStorage.clear()
  window.history.replaceState({}, '', '/?private=example#private-fragment')
  sdk.init.mockImplementation(() => sdk)
  sdk.capture.mockImplementation((event, properties) => ({ event, properties }))
  sdk.sessionRecordingStarted.mockReturnValue(true)
})
afterEach(async () => {
  const analytics = await import('./studyAnalytics')
  analytics.stopStudyAnalytics()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('starts page events and replay on a visit without inventing consent', async () => {
  const analytics = await import('./studyAnalytics')
  expect(analytics.captureStudyEvent('study_control_clicked', { control: 'search_submit' })).toBe(false)
  await analytics.initializeStudyAnalytics(context({ consent: null }))
  expect(constructor).toHaveBeenCalledTimes(1)
  expect(options()).toMatchObject({ capture_pageview: true, capture_pageleave: false, disable_session_recording: false })
  expect(analytics.getStudyAnalyticsStatus().status).toBe('ready')
  expect(filterEvent('$pageview', {})?.properties).toMatchObject({ study_session_id: 'random-study-session', is_test: true })
  expect(filterEvent('$pageview', {})?.properties).not.toHaveProperty('consented_at')
  await analytics.initializeStudyAnalytics(context({consent:null}))
  expect(sdk.init).toHaveBeenCalledTimes(1)
})

it('isolates identity in study session storage and disables unrelated automatic capture', async () => {
  const analytics = await import('./studyAnalytics')
  await analytics.initializeStudyAnalytics(context())
  expect(options()).toMatchObject({ persistence: 'sessionStorage', persistence_name: expect.stringContaining(EXPERIMENT_VERSION),
    bootstrap: { distinctID: 'random-study-session', isIdentifiedID: false }, person_profiles: 'never',
    autocapture: false, capture_pageview: true, capture_pageleave: false, capture_exceptions: false,
    capture_performance: false, enable_recording_console_log: false, save_referrer: false, save_campaign_params: false,
    session_recording: { maskAllInputs: true, recordHeaders: false, recordBody: false, recordCrossOriginIframes: false } })
  expect(sdk.startSessionRecording).toHaveBeenCalledWith({ sampling: true, linked_flag: true, url_trigger: true, event_trigger: true })
  expect(analytics.getStudyAnalyticsStatus()).toMatchObject({ status: 'ready', replayStarted: true })
  expect(localStorage.length).toBe(0)
})

it('sends one immediate pageleave per exit, not tab switches, and resumes a bfcache page', async () => {
  const analytics = await import('./studyAnalytics')
  await analytics.initializeStudyAnalytics(context({consent:null}))
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('focus'))
  window.history.pushState({}, '', '/?mapZoom=14')
  expect(sdk.capture).not.toHaveBeenCalled()
  window.dispatchEvent(new Event('beforeunload'))
  window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))
  window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))
  expect(sdk.capture).toHaveBeenCalledTimes(1)
  expect(sdk.capture).toHaveBeenLastCalledWith('$pageleave',{}, {transport:'sendBeacon',send_instantly:true})
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))
  await analytics.initializeStudyAnalytics(context({consent:null}))
  expect(sdk.init).toHaveBeenCalledTimes(2)
  expect(sdk.init.mock.calls[1][1].capture_pageview).toBe(true)
  expect(sdk.capture).toHaveBeenCalledTimes(1)
  window.dispatchEvent(new PageTransitionEvent('pagehide'))
  expect(sdk.capture).toHaveBeenCalledTimes(2)
  analytics.stopStudyAnalytics()
  window.dispatchEvent(new PageTransitionEvent('pagehide'))
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))
  expect(sdk.capture).toHaveBeenCalledTimes(2)
})

it('preserves page duration, page identity and replay diagnostics without URL query or profile properties', async () => {
  const analytics = await import('./studyAnalytics')
  await analytics.initializeStudyAnalytics(context({consent:null}))
  const event=filterEvent('$pageleave',{$pageview_id:'page-1',$prev_pageview_id:'page-1',$prev_pageview_duration:20,
    $prev_pageview_pathname:'/?private=secret',$current_url:window.location.href,$recording_status:'active',
    $session_recording_start_reason:'sampling_overridden',$replay_sample_rate:1,$sdk_debug_recording_script_not_loaded:false})
  expect(event?.properties).toMatchObject({$pageview_id:'page-1',$prev_pageview_id:'page-1',$prev_pageview_duration:20,
    $prev_pageview_pathname:'/',$current_url:`${window.location.origin}/`,is_test:true,
    $recording_status:'active',$session_recording_start_reason:'sampling_overridden',$replay_sample_rate:1,
    $sdk_debug_recording_script_not_loaded:false,study_session_id:'random-study-session'})
  expect(JSON.stringify(event)).not.toContain('secret')
})

it('queues visit events with their original method context and deduplicates a stable action key', async () => {
  const analytics = await import('./studyAnalytics')
  const loading = analytics.initializeStudyAnalytics(context({ phase: 'old-task', method: 'old' }))
  expect(analytics.captureStudyEvent('study_method_started', {}, { dedupeKey: 'method:old' })).toBe(true)
  expect(analytics.captureStudyEvent('study_method_started', {}, { dedupeKey: 'method:old' })).toBe(false)
  analytics.updateStudyAnalyticsContext(context({ phase: 'new-task', method: 'new' }))
  await loading
  expect(sdk.capture).toHaveBeenCalledTimes(1)
  expect(sdk.capture.mock.calls[0][1]).toMatchObject({ method: 'old', phase: 'old-task', event_id: expect.any(String) })
  expect(analytics.captureStudyEvent('study_method_started', {}, { dedupeKey: 'method:old' })).toBe(false)
  expect(analytics.captureStudyEvent('study_control_clicked', { control: 'announcement_pin' })).toBe(true)
  expect(sdk.capture.mock.calls[1][1]).toMatchObject({ method: 'new', phase: 'new-task' })
})

it('preserves sent action deduplication across cleanup and reload without replaying a previous hint', async () => {
  const analytics = await import('./studyAnalytics')
  await analytics.initializeStudyAnalytics(context())
  analytics.captureStudyEvent('study_hint_opened', { help_open_count: 1, elapsed_ms: 15_000 }, { dedupeKey: 'old:hint:1' })
  analytics.stopStudyAnalytics()
  await analytics.initializeStudyAnalytics(context())
  expect(analytics.captureStudyEvent('study_hint_opened', {}, { dedupeKey: 'old:hint:1' })).toBe(false)
  expect(sdk.capture).toHaveBeenCalledTimes(1)
})

it('bounds loading events and cancels delayed initialization on stop', async () => {
  const analytics = await import('./studyAnalytics')
  const loading = analytics.initializeStudyAnalytics(context())
  for (let index = 0; index < 201; index++) analytics.captureStudyEvent('study_control_clicked', { control: 'map_zoom_in' })
  expect(analytics.getStudyAnalyticsStatus()).toMatchObject({ pendingEvents: 200, droppedEvents: 1 })
  analytics.stopStudyAnalytics()
  await loading
  expect(constructor).not.toHaveBeenCalled()
  expect(sdk.capture).not.toHaveBeenCalled()
})

it('keeps the study running when configuration, initialization, or event transport fails', async () => {
  const analytics = await import('./studyAnalytics')
  vi.stubEnv('VITE_STUDY_POSTHOG_KEY', '')
  await analytics.initializeStudyAnalytics(context())
  expect(analytics.getStudyAnalyticsStatus().status).toBe('disabled')
  expect(analytics.captureStudyEvent('study_started')).toBe(false)
  analytics.stopStudyAnalytics()
  vi.stubEnv('VITE_STUDY_POSTHOG_KEY', 'phc_studytest')
  sdk.init.mockImplementationOnce(() => { throw new Error('blocked') })
  await expect(analytics.initializeStudyAnalytics(context())).resolves.toBeUndefined()
  expect(analytics.getStudyAnalyticsStatus().status).toBe('failed')
  analytics.stopStudyAnalytics()
  await analytics.initializeStudyAnalytics(context())
  sdk.capture.mockImplementationOnce(() => { throw new Error('offline') })
  expect(analytics.captureStudyEvent('study_started')).toBe(false)
  options().on_request_error?.({ statusCode: 0, text: '' })
  expect(analytics.getStudyAnalyticsStatus().requestFailures).toBe(2)
})

it('sends only explicit events and coded study properties, with sanitized SDK metadata', async () => {
  const analytics = await import('./studyAnalytics')
  await analytics.initializeStudyAnalytics(context())
  const event = filterEvent('study_control_clicked', { control: 'search_submit', query: 'contact@example.com',
    target: 'contact@example.com', action: 'submit', distinct_id: 'random-study-session', $session_id: 'replay-session',
    $initial_referrer: 'https://example.com/?secret=1', $current_url: window.location.href,
    $set: { email: 'contact@example.com' }, latitude: 37.123456, $ip: '1.2.3.4' })
  expect(event?.uuid).toBe('00000000-0000-4000-8000-000000000001')
  expect(event?.properties).toMatchObject({ token: 'phc_studytest', control: 'search_submit', action: 'submit', $session_id: 'replay-session',
    $current_url: `${window.location.origin}/`, $ip: null, $geoip_disable: true, $process_person_profile: false })
  expect(JSON.stringify(event)).not.toContain('contact@example.com')
  expect(event?.properties).not.toHaveProperty('latitude')
  expect(event?.properties).not.toHaveProperty('$set')
  expect(event).not.toHaveProperty('$set')
  expect(event).not.toHaveProperty('$set_once')
  expect(event?.properties).not.toHaveProperty('$initial_referrer')
  expect(filterEvent('$autocapture', {})).toBeNull()
  expect(filterEvent('$pageview', {})).not.toBeNull()
  expect(filterEvent('$exception', {})).toBeNull()
  expect(filterEvent('study_control_clicked', { control: 'unregistered_control' })?.properties).not.toHaveProperty('control')
})

it('preserves the real SDK capture envelope so sanitized events reach its transport', async () => {
  const analytics = await import('./studyAnalytics')
  await analytics.initializeStudyAnalytics(context())
  const { PostHog } = await vi.importActual<typeof import('posthog-js/full/no-external')>('posthog-js/full/no-external')
  const actual = new PostHog()
  vi.spyOn(actual, '_send_request').mockImplementation(() => {})
  const transport = vi.spyOn(actual, '_send_retriable_request').mockImplementation(() => {})
  actual.init('phc_studytest', { ...options(), persistence: 'memory', advanced_disable_flags: true,
    request_batching: false, disable_session_recording: true })
  const captured = actual.capture('study_control_clicked', { control: 'complex_pin' })
  expect(captured?.properties).toMatchObject({ token: 'phc_studytest', distinct_id: 'random-study-session', control: 'complex_pin' })
  expect(captured?.uuid).toEqual(expect.any(String))
  expect(transport).toHaveBeenCalled()
  await actual.shutdown()
})

it('retains replay payloads while masking URLs, inputs, search echoes, third-party frames and unmanaged canvases', async () => {
  const analytics = await import('./studyAnalytics')
  await analytics.initializeStudyAnalytics(context())
  const replay = options().session_recording
  expect(filterEvent('$snapshot', { $snapshot_data: [{ type: 2 }], $snapshot_bytes: 15 })?.properties.$snapshot_data).toEqual([{ type: 2 }])
  expect(replay?.maskAllInputs).toBe(true)
  expect(replay?.blockSelector).toContain('iframe')
  const sensitive = document.createElement('div')
  sensitive.setAttribute('data-study-sensitive', '')
  const input = document.createElement('input')
  sensitive.append(input)
  expect(replay?.maskAttributeFn?.('value', 'contact@example.com', input)).toBe('[masked]')
  expect(replay?.maskAttributeFn?.('aria-label', '검색 contact@example.com', input)).toBe('[masked]')
  expect(replay?.maskAttributeFn?.('href', 'https://example.com/form?session=secret#details', input)).toBe('https://example.com/form')
  expect(replay?.maskNetworkRequestFn?.({ url: 'https://example.com/?secret=1#secret' })).toEqual({ url: 'https://example.com/' })
  expect(replay?.maskCapturedNetworkRequestFn?.({ name: 'https://example.com/?secret=1', entryType: 'resource', startTime: 0, duration: 1 })).toBeNull()
  const navigation = replay?.maskCapturedNetworkRequestFn?.({ name: 'https://example.com/?secret=1#secret', entryType: 'navigation', startTime: 0, duration: 1, isInitial: true, requestBody: 'secret' })
  expect(navigation?.name).toBe('https://example.com/')
  expect(navigation?.requestBody).toBeUndefined()
  const canvas = document.createElement('canvas')
  expect(replay?.canvasCapture?.maskRegionsFn?.(canvas)).toBeNull()
  const map = document.createElement('div')
  map.className = 'map-surface'
  map.append(canvas)
  expect(replay?.canvasCapture?.maskRegionsFn?.(canvas)).toEqual([])
})

it('rejects unknown hosts and removes URL userinfo, query, fragments and executable protocols', async () => {
  const analytics = await import('./studyAnalytics')
  expect(analytics.sanitizeStudyUrl('https://user:password@example.com/path?email=secret#secret')).toBe('https://example.com/path')
  expect(analytics.sanitizeStudyUrl('javascript:alert(1)')).toBe('')
  vi.stubEnv('VITE_STUDY_POSTHOG_HOST', 'https://unapproved.example.com')
  await analytics.initializeStudyAnalytics(context())
  expect(sdk.init).not.toHaveBeenCalled()
  expect(analytics.getStudyAnalyticsStatus().status).toBe('disabled')
})
