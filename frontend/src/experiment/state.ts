import type { StudyPath } from './explorerStudy'

export const EXPERIMENT_VERSION = 'announcement-map-v1'
export const QUESTION_VERSION = 'survey-v1'
export type StudyStep = 'intro' | 'warmup' | 'old-task' | 'old-guide' | 'new-task' | 'new-guide' | 'compare' | 'survey' | 'complete'
export type TrialKey = 'old' | 'new'
export interface TrialResult {
  outcome: 'active' | 'success' | 'skipped'
  elapsedMs: number
  helpAtMs: number | null
  helpReason: 'requested' | 'timeout' | 'give_up' | null
  paths: StudyPath[]
  announcementId: string | null
  requestedAnnouncementId: string | null
  interrupted: boolean
  errors: number
  retries: number
}
export interface ExperimentState {
  version: typeof EXPERIMENT_VERSION
  datasetVersion: string
  sessionId: string
  step: StudyStep
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
  screen: 'mobile' | 'desktop'
  test: boolean
  old: TrialResult
  new: TrialResult
}
export function emptyTrial(): TrialResult {
  return {outcome:'active', elapsedMs:0, helpAtMs:null, helpReason:null, paths:[], announcementId:null, requestedAnnouncementId:null, interrupted:false, errors:0, retries:0}
}
export function initialState(datasetVersion: string, sessionId: string, test = false): ExperimentState {
  return {version:EXPERIMENT_VERSION, datasetVersion, sessionId, step:'intro', trials:{old:emptyTrial(), new:emptyTrial()}, test, responseId:null}
}
export function activeTrial(state: ExperimentState): TrialKey | null {
  return state.step === 'old-task' ? 'old' : state.step === 'new-task' ? 'new' : null
}
export type StudyAction =
  | {type:'step'; step:StudyStep}
  | {type:'tick'; milliseconds:number}
  | {type:'help'; reason: NonNullable<TrialResult['helpReason']>}
  | {type:'path'; path:StudyPath}
  | {type:'request-detail'; id:string}
  | {type:'success'; id:string; status:string | null}
  | {type:'skip'} | {type:'error'} | {type:'retry'}
  | {type:'submitted'; responseId:string}
export function studyReducer(state:ExperimentState, action:StudyAction): ExperimentState {
  if (action.type === 'step') return {...state, step:action.step}
  if (action.type === 'submitted') return state.step === 'survey' ? {...state, step:'complete', responseId:action.responseId} : state
  const key = activeTrial(state)
  if (!key) return state
  const trial = state.trials[key]
  if (trial.outcome !== 'active') return state
  let next = trial
  switch (action.type) {
    case 'tick': {
      if (!Number.isFinite(action.milliseconds) || action.milliseconds <= 0) return state
      const elapsedMs = trial.elapsedMs + action.milliseconds
      next = {...trial, elapsedMs}
      if (trial.helpAtMs === null && elapsedMs >= 60_000) next = {...next, helpAtMs:60_000, helpReason:'timeout'}
      break
    }
    case 'help': next = trial.helpAtMs === null ? {...trial, helpAtMs:trial.elapsedMs, helpReason:action.reason} : trial; break
    case 'path': next = {...trial, paths:[...new Set([...trial.paths, action.path])]}; break
    case 'request-detail': next = {...trial, requestedAnnouncementId:action.id}; break
    case 'success':
      if (trial.requestedAnnouncementId !== action.id) return state
      if (action.status !== 'BEFORE_APPLICATION' && action.status !== 'APPLYING') return state
      next = {...trial, outcome:'success', announcementId:action.id}; break
    case 'skip': next = {...trial, outcome:'skipped'}; break
    case 'error': next = {...trial, errors:trial.errors+1}; break
    case 'retry': next = {...trial, retries:trial.retries+1, interrupted:true}; break
  }
  return {...state, trials:{...state.trials, [key]:next}}
}
const STORAGE_KEY = 'bokduckbang.study.v1'
export function saveState(state:ExperimentState) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* Browser storage may be disabled; the current session still works. */ }
}
function validTrial(value:unknown): value is TrialResult {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string,unknown>
  return ['active','success','skipped'].includes(String(v.outcome)) && typeof v.elapsedMs === 'number' && Number.isFinite(v.elapsedMs) && v.elapsedMs >= 0
    && (v.helpAtMs === null || typeof v.helpAtMs === 'number') && [null,'requested','timeout','give_up'].includes(v.helpReason as never)
    && Array.isArray(v.paths) && v.paths.every(p => ['filter','announcement_map','search','announcement_list','complex','recent'].includes(p))
    && (v.requestedAnnouncementId === null || typeof v.requestedAnnouncementId === 'string')
    && (v.announcementId === null || typeof v.announcementId === 'string') && typeof v.interrupted === 'boolean'
    && typeof v.errors === 'number' && typeof v.retries === 'number'
}
export function restoreState(source:string | null, datasetVersion:string): ExperimentState | null {
  try {
    const state:unknown = JSON.parse(source ?? 'null')
    if (!state || typeof state !== 'object') return null
    const v = state as Partial<ExperimentState>
    if (v.version !== EXPERIMENT_VERSION || v.datasetVersion !== datasetVersion || typeof v.sessionId !== 'string'
      || !['intro','warmup','old-task','old-guide','new-task','new-guide','compare','survey','complete'].includes(v.step ?? '')
      || typeof v.test !== 'boolean' || !v.trials || !validTrial(v.trials.old) || !validTrial(v.trials.new)
      || (v.responseId !== null && typeof v.responseId !== 'string')) return null
    const restored = v as ExperimentState
    const key = activeTrial(restored)
    return key && restored.trials[key].outcome === 'active'
      ? {...restored, trials:{...restored.trials, [key]:{...restored.trials[key], interrupted:true}}} : restored
  } catch { return null }
}
export function readState(datasetVersion:string) {
  try { return restoreState(sessionStorage.getItem(STORAGE_KEY), datasetVersion) } catch { return null }
}
export function makeSummary(state:ExperimentState, asOf:string, mobile:boolean): ExperimentSummary {
  return {experimentVersion:state.version, questionVersion:QUESTION_VERSION, datasetVersion:state.datasetVersion, asOf,
    sessionId:state.sessionId, screen:mobile ? 'mobile' : 'desktop', test:state.test, ...state.trials}
}
