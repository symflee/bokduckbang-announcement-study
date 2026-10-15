import type { CaptureResult, PostHog, PostHogConfig } from 'posthog-js'
import { CONSENT_VERSION, type ExperimentState, type StudyStep, type TrialKey } from './state'
import { STUDY_CONTROLS, type StudyControl } from './explorerStudy'

export interface StudyAnalyticsContext {
  sessionId: string
  experimentVersion: string
  questionVersion: string
  datasetVersion: string
  order: readonly ['old', 'new']
  test: boolean
  screen: 'mobile' | 'desktop'
  phase: StudyStep | 'loading'
  method: TrialKey | 'none' | null
  consent: ExperimentState['consent']
}

export const STUDY_ANALYTICS_EVENTS = [
  'study_started', 'study_tour_step_viewed', 'study_phase_entered', 'study_method_started',
  'study_control_clicked', 'study_hint_opened', 'study_announcement_opened',
  'study_method_completed', 'study_method_rated', 'study_error', 'study_retry', 'study_survey_submitted',
] as const
export type StudyAnalyticsEvent = typeof STUDY_ANALYTICS_EVENTS[number]
export type StudyAnalyticsProperties = {
  control?: StudyControl; target?: string; action?: string; source?: string | null; status?: string | null
  outcome?: 'success' | 'skipped'; ease?: 1 | 2 | 3 | 4 | 5 | 'unsure'
  tour_step?: number; tour_step_id?: string; consent_version?: string; consented_at?: string
  errors?: number; retries?: number; surface?: 'map' | 'data' | 'detail'
  help_open_count?: number; first_help_at_ms?: number | null; elapsed_ms?: number
  hint_code?: string; map_mode?: string; status_filtered?: boolean; map_view?: string
  detail_state?: string; complex_from_filtered_pin?: boolean; choices_open?: boolean; list_open?: boolean
  wrong_route?: boolean; interrupted?: boolean
}
type Status = 'idle' | 'disabled' | 'loading' | 'ready' | 'failed'
interface PendingEvent { name: StudyAnalyticsEvent; properties: Record<string, unknown>; timestamp: Date; dedupeKey?: string }
const MAX_PENDING = 200
const MAX_SEEN = 1_000
const SENSITIVE_SELECTOR = '[data-study-sensitive], .search-panel, .search-combobox'
const NUMERIC_KEYS = new Set(['tour_step', 'errors', 'retries', 'help_open_count', 'first_help_at_ms', 'elapsed_ms'])
const BOOLEAN_KEYS = new Set(['status_filtered', 'complex_from_filtered_pin', 'choices_open', 'list_open', 'wrong_route', 'interrupted'])
const TOKEN_KEYS = new Set(['target', 'action', 'tour_step_id', 'hint_code'])
const ENUM_VALUES: Record<string, readonly string[]> = {
  control: STUDY_CONTROLS,
  source: ['filtered_complex', 'announcement_pin', 'other'], outcome: ['success', 'skipped'],
  status: ['BEFORE_APPLICATION', 'APPLYING', 'CLOSED', 'UNKNOWN', 'FINISHED', 'AFTER_APPLICATION'],
  surface: ['map', 'data', 'detail'], map_mode: ['complexes', 'announcements'],
  map_view: ['aggregate', 'individual', 'empty'], detail_state: ['none', 'complex-active', 'complex-empty', 'announcement'],
}
const SDK_PROPERTIES = new Set(['token', 'distinct_id', '$device_id', '$session_id', '$window_id', '$lib', '$lib_version', '$sdk_debug_replay_internal_buffer_length',
  '$snapshot_data', '$snapshot_bytes', '$is_identified', '$process_person_profile', '$session_recording', '$recording_status',
  '$session_recording_start_reason', '$replay_sample_rate', '$sdk_debug_recording_script_not_loaded',
  '$pageview_id', '$prev_pageview_id', '$prev_pageview_duration', '$prev_pageview_last_scroll_percentage',
  '$prev_pageview_max_scroll_percentage', '$prev_pageview_last_content_percentage', '$prev_pageview_max_content_percentage',
  '$browser', '$browser_version', '$os', '$os_version', '$device_type', '$screen_height', '$screen_width', '$viewport_height', '$viewport_width'])
let context: StudyAnalyticsContext | null = null
let instance: PostHog | null = null
let status: Status = 'idle'
let loading: Promise<void> | null = null
let generation = 0
let pending: PendingEvent[] = []
let seen = new Set<string>()
let queuedKeys = new Set<string>()
let requestFailures = 0
let droppedEvents = 0
let removePageListeners: (() => void) | null = null

function validContext(value: StudyAnalyticsContext): boolean {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(value.sessionId)
}
function storageKey() { return `bokduckbang.study.analytics.seen.${context?.experimentVersion}.${context?.sessionId}` }
function readSeen() {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey()) ?? '[]')
    seen = new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string').slice(-MAX_SEEN) : [])
  } catch { seen = new Set() }
}
function remember(key: string) {
  seen.add(key)
  seen = new Set([...seen].slice(-MAX_SEEN))
  try { sessionStorage.setItem(storageKey(), JSON.stringify([...seen])) } catch { /* Memory deduplication still works. */ }
}
function configuration(): { key: string; host: string } | null {
  const key = String(import.meta.env.VITE_STUDY_POSTHOG_KEY ?? '').trim()
  const host = String(import.meta.env.VITE_STUDY_POSTHOG_HOST ?? '').trim().replace(/\/$/, '')
  if (!/^phc_[a-zA-Z0-9]+$/.test(key)) return null
  if (!['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(host)) return null
  return { key, host }
}

/** Only coded values cross the analytics boundary; input text and arbitrary property names are dropped. */
function cleanProperties(input: StudyAnalyticsProperties): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (NUMERIC_KEYS.has(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0) result[key] = value
    else if (BOOLEAN_KEYS.has(key) && typeof value === 'boolean') result[key] = value
    else if (TOKEN_KEYS.has(key) && typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value)) result[key] = value
    else if (typeof value === 'string' && ENUM_VALUES[key]?.includes(value)) result[key] = value
    else if (key === 'ease' && (value === 'unsure' || typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5)) result[key] = value
    else if (key === 'first_help_at_ms' && value === null) result[key] = null
    else if (key === 'consent_version' && value === CONSENT_VERSION) result[key] = value
    else if (key === 'consented_at' && typeof value === 'string' && value === context?.consent?.acceptedAt) result[key] = value
  }
  return result
}

/** Retain resource paths for replay rendering, never userinfo, query strings, or fragments. */
export function sanitizeStudyUrl(value: string): string {
  try {
    const url = new URL(value, window.location.origin)
    return ['https:', 'http:'].includes(url.protocol) ? `${url.origin}${url.pathname}` : ''
  } catch { return '' }
}
function maskAttribute(name: string, value: string, element?: Element): string {
  if (['value', 'srcdoc', 'data-query', 'data-search', 'data-search-term'].includes(name)) return '[masked]'
  if (['aria-label', 'title', 'placeholder'].includes(name) && element?.closest(SENSITIVE_SELECTOR)) return '[masked]'
  if (['href', 'src', 'action', 'formaction', 'poster'].includes(name)) {
    if (value.startsWith('data:image/') || value.startsWith('blob:') || value.startsWith('#')) return value
    return sanitizeStudyUrl(value)
  }
  if (name === 'srcset') return ''
  return value
}
function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event || !context || !validContext(context)) return null
  const snapshot = event.event === '$snapshot'
  const pageEvent = event.event === '$pageview' || event.event === '$pageleave'
  if (!snapshot && !pageEvent && !STUDY_ANALYTICS_EVENTS.includes(event.event as StudyAnalyticsEvent)) return null
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event.properties)) {
    if (SDK_PROPERTIES.has(key) || key.startsWith('$sdk_debug_replay_')) safe[key] = value
  }
  if (!snapshot) {
    // SDK page events do not pass through captureStudyEvent. Attach the current
    // study context here, while queued product events keep their original phase.
    const properties = pageEvent ? commonProperties(context) : event.properties
    const eventId = pageEvent ? event.uuid : event.properties.event_id
    Object.assign(safe, cleanProperties(event.properties), {
      study_session_id: properties.study_session_id,
      experiment_version: properties.experiment_version,
      question_version: properties.question_version,
      dataset_version: properties.dataset_version,
      method_order: properties.method_order,
      is_test: properties.is_test, screen: properties.screen,
      phase: properties.phase, method: properties.method,
      event_id: eventId, $insert_id: eventId,
    })
  }
  // ip:false no longer suppresses IP storage in this SDK; also enable Discard IP data in the project.
  safe.$ip = null
  safe.$geoip_disable = true
  safe.$process_person_profile = false
  safe.$current_url = `${window.location.origin}/`
  safe.$pathname = '/'
  safe.$host = window.location.host
  if (event.properties.$prev_pageview_pathname) safe.$prev_pageview_pathname = '/'
  return { event: event.event, uuid: event.uuid, timestamp: event.timestamp, properties: safe }
}

function sdkOptions(current: StudyAnalyticsContext, host: string): Partial<PostHogConfig> {
  return {
    api_host: host, ui_host: host.includes('eu.i.') ? 'https://eu.posthog.com' : 'https://us.posthog.com',
    persistence: 'sessionStorage', persistence_name: `bokduckbang-study-${current.experimentVersion}-${current.sessionId}`,
    bootstrap: { distinctID: current.sessionId, isIdentifiedID: false }, get_device_id: () => current.sessionId,
    person_profiles: 'never', cross_subdomain_cookie: false,
    // Only document loads/leaves count; map/detail query changes are not new pages.
    autocapture: false, capture_pageview: true, capture_pageleave: false, capture_dead_clicks: false,
    capture_heatmaps: false, capture_exceptions: false, rageclick: false, capture_performance: false,
    save_referrer: false, save_campaign_params: false, disable_capture_url_hashes: true,
    disable_surveys: true, disable_product_tours: true, disable_conversations: true, disable_web_experiments: true,
    advanced_disable_feature_flags: true, remote_config_refresh_interval_ms: 0,
    enable_recording_console_log: false, disable_session_recording: false,
    session_recording: {
      maskAllInputs: true, maskTextSelector: SENSITIVE_SELECTOR, maskAttributeFn: maskAttribute,
      blockSelector: 'iframe, input[type="hidden"], input[type="file"], [data-study-replay-block]',
      recordCrossOriginIframes: false, recordHeaders: false, recordBody: false, captureJsonLd: false,
      captureCanvas: { recordCanvas: true, canvasFps: 4, canvasQuality: '0.4' },
      canvasCapture: { maskRegionsFn: canvas => canvas.closest('.map-surface') ? [] : null },
      maskCapturedNetworkRequestFn: entry => entry.isInitial ? { ...entry, name: sanitizeStudyUrl(entry.name),
        requestHeaders: undefined, requestBody: undefined, responseHeaders: undefined, responseBody: undefined } : null,
      // Replay metadata URLs also use this legacy callback in the pinned SDK.
      maskNetworkRequestFn: request => ({ url: sanitizeStudyUrl(request.url) }),
    },
    before_send: beforeSend,
    on_request_error: () => { requestFailures++ },
  }
}

export function updateStudyAnalyticsContext(next: StudyAnalyticsContext): void {
  if (context?.sessionId === next.sessionId && validContext(next)) context = { ...next }
}

export function initializeStudyAnalytics(next: StudyAnalyticsContext): Promise<void> {
  if (!validContext(next)) { stopStudyAnalytics(); return Promise.resolve() }
  if (context?.sessionId === next.sessionId) {
    updateStudyAnalyticsContext(next)
    if (instance || loading || status === 'failed' || status === 'disabled') return loading ?? Promise.resolve()
  } else {
    stopStudyAnalytics()
    context = { ...next }
    readSeen()
  }
  const config = configuration()
  if (!config) { status = 'disabled'; return Promise.resolve() }
  status = 'loading'
  const expected = generation
  // The full build bundles the recorder. Collection starts with the page visit.
  const operation = import('posthog-js/full/no-external').then(({ PostHog: Constructor }) => {
    if (generation !== expected || !context || !validContext(context)) return
    const sdk = new Constructor()
    instance = sdk
    sdk.init(config.key, sdkOptions(context, config.host))
    sdk.startSessionRecording({ sampling: true, linked_flag: true, url_trigger: true, event_trigger: true })
    status = 'ready'
    watchPageLifecycle(sdk)
    const queue = pending
    pending = []
    queuedKeys.clear()
    queue.forEach(send)
  }).catch(() => {
    if (generation === expected) {
      try { instance?.stopSessionRecording() } catch { /* A blocked SDK must not reject the initialization promise. */ }
      instance = null
      droppedEvents += pending.length
      pending = []
      queuedKeys.clear()
      status = 'failed'
    }
  }).finally(() => { if (loading === operation) loading = null })
  loading = operation
  return operation
}

function watchPageLifecycle(sdk: PostHog) {
  let left = false
  const leave = () => {
    if (left || instance !== sdk || status !== 'ready') return
    left = true
    // Capture before the SDK enters its unloading state; pagehide is the fallback
    // for browsers that omit beforeunload. Tab visibility changes are not exits.
    try {
      if (!sdk.capture('$pageleave', {}, { transport: 'sendBeacon', send_instantly: true })) droppedEvents++
    }
    catch { requestFailures++ }
  }
  const resume = (event: PageTransitionEvent) => {
    if (!event.persisted || !left || instance !== sdk || status !== 'ready' || !context) return
    left = false
    // A cached document keeps the SDK's unloading flag. A fresh instance restores
    // capture/replay while sessionStorage retains the participant and replay session.
    const resumed = { ...context }
    stopStudyAnalytics()
    void initializeStudyAnalytics(resumed)
  }
  window.addEventListener('beforeunload', leave, true)
  window.addEventListener('pagehide', leave, true)
  window.addEventListener('pageshow', resume)
  removePageListeners = () => {
    window.removeEventListener('beforeunload', leave, true)
    window.removeEventListener('pagehide', leave, true)
    window.removeEventListener('pageshow', resume)
  }
}

function send(event: PendingEvent): boolean {
  if (!instance || !context || status !== 'ready') return false
  try {
    const captured = instance.capture(event.name, event.properties, { timestamp: event.timestamp })
    if (!captured) { droppedEvents++; return false }
    if (event.dedupeKey) remember(event.dedupeKey)
    return true
  } catch { requestFailures++; droppedEvents++; return false }
}

function commonProperties(current: StudyAnalyticsContext): Record<string, unknown> {
  return { study_session_id: current.sessionId, experiment_version: current.experimentVersion,
    question_version: current.questionVersion, dataset_version: current.datasetVersion, method_order: current.order.join(','),
    is_test: current.test, screen: current.screen, phase: current.phase, method: current.method ?? 'none' }
}

export function captureStudyEvent(name: StudyAnalyticsEvent, properties: StudyAnalyticsProperties = {}, options: {dedupeKey?: string} = {}): boolean {
  if (!context || !validContext(context) || !['loading', 'ready'].includes(status) || !STUDY_ANALYTICS_EVENTS.includes(name)) return false
  if (options.dedupeKey && (seen.has(options.dedupeKey) || queuedKeys.has(options.dedupeKey))) return false
  const event: PendingEvent = {
    name, dedupeKey: options.dedupeKey, timestamp: new Date(), properties: {
      ...cleanProperties(properties), ...commonProperties(context), event_id: crypto.randomUUID(),
    },
  }
  if (status === 'ready') return send(event)
  if (pending.length >= MAX_PENDING) { droppedEvents++; return false }
  pending.push(event)
  if (event.dedupeKey) queuedKeys.add(event.dedupeKey)
  return true
}

export function stopStudyAnalytics(): void {
  generation++
  removePageListeners?.()
  removePageListeners = null
  context = null
  pending = []
  queuedKeys.clear()
  loading = null
  try { instance?.stopSessionRecording(); instance?.set_config({ before_send: () => null }) } catch { /* Cleanup cannot break the study. */ }
  instance = null
  status = 'idle'
}

/** Initialization is not provider receipt. This status is for developer diagnostics only. */
export function getStudyAnalyticsStatus() {
  let replayStarted = false
  try { replayStarted = instance?.sessionRecordingStarted() ?? false } catch { /* Remains unverified. */ }
  return { status, replayStarted, requestFailures, droppedEvents, pendingEvents: pending.length }
}
