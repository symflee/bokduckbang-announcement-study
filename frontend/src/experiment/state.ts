import { SERVICE_TOUR } from './serviceTour'
import type { CompletionSource, StudyDetailRequest, StudyPath } from './explorerStudy'

export const EXPERIMENT_VERSION = 'announcement-map-v5'
export const QUESTION_VERSION = 'survey-v2'
export type StudyStep = 'intro' | 'warmup' | 'explore' | 'briefing' | 'old-task' | 'new-task' | 'compare' | 'survey' | 'complete'
const INTRODUCED_STEPS = ['old-task', 'new-task', 'compare'] as const
export type IntroducedStep = typeof INTRODUCED_STEPS[number]
export function hasStepIntroduction(step: StudyStep): step is IntroducedStep {
  return INTRODUCED_STEPS.some(value => value === step)
}
export type TrialKey = 'old' | 'new'
export type MethodOrder = readonly ['old', 'new'] | readonly ['new', 'old']
export type EaseRating = 1 | 2 | 3 | 4 | 5 | 'unsure'
export const METHOD_NAMES: Record<TrialKey, string> = {old:'필터로 찾기', new:'공고지도로 찾기'}
export interface TrialResult {
  outcome: 'active' | 'success' | 'skipped'
  elapsedMs: number
  helpAtMs: number | null
  helpReason: 'requested' | null
  paths: StudyPath[]
  announcementId: string | null
  requestedDetail: StudyDetailRequest | null
  completionSource: CompletionSource | null
  wrongRoute: boolean
  ease: EaseRating | null
  interrupted: boolean
  errors: number
  retries: number
}
export interface ExperimentState {
  version: typeof EXPERIMENT_VERSION
  datasetVersion: string
  sessionId: string
  order: MethodOrder
  step: StudyStep
  stageStarted: boolean
  tourStep: number
  trials: {old: TrialResult; new: TrialResult}
  test: boolean
  responseId: string | null
}
export interface ExperimentSummary {
  experimentVersion: string
  questionVersion: string
  datasetVersion: string
  asOf: string
  sessionId: string
  order: MethodOrder
  screen: 'mobile' | 'desktop'
  test: boolean
  old: TrialResult
  new: TrialResult
}
export function emptyTrial(): TrialResult {
  return {outcome:'active', elapsedMs:0, helpAtMs:null, helpReason:null,  paths:[], announcementId:null,
    requestedDetail:null, completionSource:null, wrongRoute:false, ease:null, interrupted:false, errors:0, retries:0}
}
export function randomMethodOrder(): MethodOrder {
  return crypto.getRandomValues(new Uint32Array(1))[0] % 2 === 0 ? ['old','new'] : ['new','old']
}
export function initialState(datasetVersion: string, sessionId: string, test = false, order: MethodOrder = randomMethodOrder()): ExperimentState {
  return {version:EXPERIMENT_VERSION, datasetVersion, sessionId, order, step:'intro', stageStarted:true, tourStep:0,
    trials:{old:emptyTrial(), new:emptyTrial()}, test, responseId:null}
}
export function activeTrial(state:ExperimentState): TrialKey | null {
  if (!state.stageStarted) return null
  return state.step === 'old-task' ? 'old' : state.step === 'new-task' ? 'new' : null
}
export function isEaseRating(value:unknown): value is EaseRating {
  return value === 'unsure' || typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}
export type StudyAction =
  | {type:'step'; step:StudyStep}
  | {type:'begin-step'}
  | {type:'tour-step'; index:number}
  | {type:'tick'; milliseconds:number}
  | {type:'help'; reason:'requested'}
  | {type:'rate'; value:EaseRating}
  | {type:'path'; path:StudyPath}
  | ({type:'request-detail'} & StudyDetailRequest)
  | {type:'success'; requestId:string; id:string; status:string | null}
  | {type:'skip'} | {type:'error'} | {type:'retry'}
  | {type:'submitted'; responseId:string}
export function studyReducer(state:ExperimentState, action:StudyAction): ExperimentState {
  if (action.type === 'step') return {...state, step:action.step, stageStarted:!hasStepIntroduction(action.step)}
  if (action.type === 'tour-step') return state.step === 'warmup' ? {...state, tourStep:Math.max(0,Math.min(SERVICE_TOUR.length-1,action.index))} : state
  if (action.type === 'begin-step') return state.stageStarted ? state : {...state, stageStarted:true}
  if (action.type === 'submitted') return state.step === 'survey' ? {...state, step:'complete', responseId:action.responseId} : state
  const key = activeTrial(state)
  if (!key) return state
  const trial = state.trials[key]
  if (action.type === 'rate') {
    return trial.outcome !== 'active' && trial.ease === null && isEaseRating(action.value)
      ? {...state, trials:{...state.trials, [key]:{...trial, ease:action.value}}} : state
  }
  if (trial.outcome !== 'active') return state
  let next = trial
  switch (action.type) {
    case 'tick':
      if (!Number.isFinite(action.milliseconds) || action.milliseconds <= 0) return state
      next = {...trial, elapsedMs:trial.elapsedMs+action.milliseconds}; break
    case 'help': next = trial.helpAtMs === null ? {...trial, helpAtMs:trial.elapsedMs, helpReason:'requested'} : trial; break
    case 'path': next = {...trial, paths:[...new Set([...trial.paths, action.path])]}; break
    case 'request-detail': {
      const {requestId,id,source,complexId,applicationStatuses}=action
      next = {...trial, requestedDetail:{requestId,id,source,complexId,applicationStatuses}, wrongRoute:false}; break
    }
    case 'success': {
      const request=trial.requestedDetail
      if (!request || request.requestId !== action.requestId || request.id !== action.id) return state
      if (action.status !== 'BEFORE_APPLICATION' && action.status !== 'APPLYING') return state
      const expected: CompletionSource = key === 'old' ? 'filtered_complex' : 'announcement_pin'
      const matches = request.source === expected && request.complexId !== null
        && (key === 'new' || request.applicationStatuses.includes(action.status))
      next = matches ? {...trial, outcome:'success', announcementId:action.id, completionSource:expected, wrongRoute:false}
        : {...trial, wrongRoute:true}
      break
    }
    case 'skip': next = {...trial, outcome:'skipped', requestedDetail:null, wrongRoute:false}; break
    case 'error': next = {...trial, errors:trial.errors+1}; break
    case 'retry': next = {...trial, retries:trial.retries+1, interrupted:true}; break
  }
  return {...state, trials:{...state.trials, [key]:next}}
}
const STORAGE_KEY = 'bokduckbang.study.v1'
export function saveState(state:ExperimentState) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* The current session still works when storage is disabled. */ }
}
function validRequest(value:unknown): boolean {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const v=value as Record<string,unknown>
  return typeof v.requestId === 'string' && typeof v.id === 'string' && ['filtered_complex','announcement_pin','other'].includes(String(v.source))
    && (v.complexId === null || typeof v.complexId === 'string') && Array.isArray(v.applicationStatuses) && v.applicationStatuses.every(s=>typeof s === 'string')
}
function validTrial(value:unknown): value is TrialResult {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string,unknown>
  return ['active','success','skipped'].includes(String(v.outcome)) && typeof v.elapsedMs === 'number' && Number.isFinite(v.elapsedMs) && v.elapsedMs >= 0
    && (v.helpAtMs === null || typeof v.helpAtMs === 'number' && Number.isFinite(v.helpAtMs) && v.helpAtMs >= 0) && (v.helpReason === null || v.helpReason === 'requested')
    && Array.isArray(v.paths) && v.paths.every(p => ['filter','announcement_map','search','announcement_list','complex','recent'].includes(p))
    && validRequest(v.requestedDetail) && [null,'filtered_complex','announcement_pin'].includes(v.completionSource as never)
    && (v.ease === null || isEaseRating(v.ease)) && typeof v.wrongRoute === 'boolean'
    && (v.announcementId === null || typeof v.announcementId === 'string') && typeof v.interrupted === 'boolean'
    && typeof v.errors === 'number' && Number.isInteger(v.errors) && v.errors >= 0 && typeof v.retries === 'number' && Number.isInteger(v.retries) && v.retries >= 0
}
export function restoreState(source:string | null, datasetVersion:string): ExperimentState | null {
  try {
    const state:unknown = JSON.parse(source ?? 'null')
    if (!state || typeof state !== 'object') return null
    const v = state as Partial<ExperimentState>
    if (v.version !== EXPERIMENT_VERSION || v.datasetVersion !== datasetVersion || typeof v.sessionId !== 'string'
      || !Array.isArray(v.order) || !['old,new','new,old'].includes(v.order.join(',')) || v.order.length !== 2
      || !['intro','warmup','explore','briefing','old-task','new-task','compare','survey','complete'].includes(v.step ?? '')
      || !Number.isInteger(v.tourStep) || (v.tourStep ?? -1) < 0 || (v.tourStep ?? SERVICE_TOUR.length) >= SERVICE_TOUR.length
      || typeof v.stageStarted !== 'boolean' || typeof v.test !== 'boolean' || !v.trials || !validTrial(v.trials.old) || !validTrial(v.trials.new)
      || (v.responseId !== null && typeof v.responseId !== 'string')) return null
    const restored = v as ExperimentState
    const key = activeTrial(restored)
    return key && restored.trials[key].outcome === 'active'
      ? {...restored, trials:{...restored.trials, [key]:{...restored.trials[key], requestedDetail:null, interrupted:true}}} : restored
  } catch { return null }
}
export function readState(datasetVersion:string) {
  try { return restoreState(sessionStorage.getItem(STORAGE_KEY), datasetVersion) } catch { return null }
}
export function makeSummary(state:ExperimentState, asOf:string, mobile:boolean): ExperimentSummary {
  return {experimentVersion:state.version, questionVersion:QUESTION_VERSION, datasetVersion:state.datasetVersion, asOf,
    sessionId:state.sessionId, order:state.order, screen:mobile ? 'mobile' : 'desktop', test:state.test, ...state.trials}
}
