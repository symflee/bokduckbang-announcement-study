import { StrictMode, type ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudyAnalytics, useStudyPageVisit } from './useStudyAnalytics'
import { initialState, restoreState, saveState, studyReducer, type ExperimentState, type TrialKey } from './state'
import { EMPTY_HINT_CONTEXT, selectStudyHint } from './studyHints'
import type { StudyAnalyticsContext, StudyAnalyticsEvent, StudyAnalyticsProperties } from './studyAnalytics'

const collector=vi.hoisted(()=>({
  initialize:vi.fn<(context:StudyAnalyticsContext)=>Promise<void>>(),
  update:vi.fn<(context:StudyAnalyticsContext)=>void>(),
  capture:vi.fn<(name:StudyAnalyticsEvent, properties?:StudyAnalyticsProperties, options?:{dedupeKey?:string})=>boolean>(),
  stop:vi.fn<()=>void>(),
}))
vi.mock('./studyAnalytics',()=>({
  initializeStudyAnalytics:collector.initialize,updateStudyAnalyticsContext:collector.update,
  captureStudyEvent:collector.capture,stopStudyAnalytics:collector.stop,
}))
interface RecordedEvent { name:StudyAnalyticsEvent; properties:StudyAnalyticsProperties; context:StudyAnalyticsContext }
let context:StudyAnalyticsContext | null
let recorded:RecordedEvent[]
let seen:Set<string>
const started=()=>studyReducer(initialState('dataset-v1','session-1'),{type:'start-study'})
const begin=(state:ExperimentState,method:TrialKey)=>studyReducer(studyReducer(state,{type:'step',step:`${method}-task`}),{type:'begin-step'})
const tick=(state:ExperimentState,milliseconds:number)=>studyReducer(state,{type:'tick',milliseconds})
function hint(state:ExperimentState,method:TrialKey) {
  const mode=method==='old'?'complexes':'announcements'
  return studyReducer(state,{type:'help',reason:'requested',mode,context:EMPTY_HINT_CONTEXT,hintCode:selectStudyHint(method,mode,EMPTY_HINT_CONTEXT).code})
}
function complete(state:ExperimentState,method:TrialKey) {
  const source=method==='old'?'filtered_complex':'announcement_pin'
  const requested=studyReducer(state,{type:'request-detail',requestId:`request-${method}`,id:'1',source,complexId:'10001',applicationStatuses:['APPLYING']})
  return studyReducer(requested,{type:'success',requestId:`request-${method}`,id:'1',status:'APPLYING'})
}
const events=(name:StudyAnalyticsEvent)=>recorded.filter(event=>event.name===name)

beforeEach(()=>{
  context=null;recorded=[];seen=new Set();sessionStorage.clear()
  vi.clearAllMocks()
  vi.stubGlobal('matchMedia',()=>({matches:false}))
  collector.initialize.mockImplementation(next=>{context={...next};return Promise.resolve()})
  collector.update.mockImplementation(next=>{if(context?.sessionId===next.sessionId) context={...next}})
  // Model the collector's accepted-event boundary, including its dedupe contract.
  collector.capture.mockImplementation((name,properties={},options={})=>{
    if(!context) return false
    const key=options.dedupeKey ? `${context.sessionId}:${options.dedupeKey}` : null
    if(key && seen.has(key)) return false
    if(key) seen.add(key)
    recorded.push({name,properties:{...properties},context:{...context}})
    return true
  })
  collector.stop.mockImplementation(()=>{context=null})
})
afterEach(()=>{vi.unstubAllGlobals()})

describe('study analytics transitions',()=>{
  it('keeps the participant and accepted-event history when reloading the current dataset',()=>{
    const saved=studyReducer(initialState('national-500-v2','returning-participant'),{type:'start-study'})
    saveState(saved)
    seen.add('returning-participant:started')
    const {result}=renderHook(()=>{
      const visit=useStudyPageVisit()
      useStudyAnalytics(visit)
      return visit
    })
    expect(result.current.sessionId).toBe('returning-participant')
    expect(result.current.step).toBe('warmup')
    expect(events('study_started')).toHaveLength(0)
  })

  it('starts a new participant before capture when saved progress belongs to an older dataset',()=>{
    const saved=studyReducer(initialState('national-500-v1','previous-participant'),{type:'start-study'})
    saveState(saved)
    seen.add('previous-participant:started')
    const {result}=renderHook(()=>{
      const visit=useStudyPageVisit()
      useStudyAnalytics(studyReducer(visit,{type:'start-study'}))
      return visit
    })
    expect(result.current.sessionId).not.toBe('previous-participant')
    expect(result.current.datasetVersion).toBe('national-500-v2')
    expect(collector.initialize.mock.calls.every(([value])=>value.sessionId===result.current.sessionId)).toBe(true)
    expect(events('study_started')).toHaveLength(1)
    expect(events('study_started')[0].context.sessionId).toBe(result.current.sessionId)
  })

  it('initializes on the welcome screen but records study_started only when the participant starts',()=>{
    const {result,rerender}=renderHook(({state})=>useStudyAnalytics(state),{initialProps:{state:initialState('dataset-v1','session-1')}})
    expect(collector.initialize).toHaveBeenCalledTimes(1)
    expect(events('study_started')).toEqual([])
    expect(result.current('study_control_clicked',{control:'filter_open'})).toBe(true)
    const state=started()
    rerender({state})
    expect(events('study_started')).toHaveLength(1)
    expect(events('study_started')[0]).toMatchObject({properties:{},context:{sessionId:'session-1',phase:'warmup',method:'none',consent:null}})
    expect(events('study_started')[0].properties).not.toHaveProperty('consent_version')
    expect(events('study_phase_entered').map(event=>event.context.phase)).toEqual(['intro','warmup'])
    expect(events('study_tour_step_viewed')[0].properties.tour_step).toBe(1)
  })

  it('starts a method after its introduction and does not duplicate transitions on timer rerenders',()=>{
    let state=started()
    const {rerender}=renderHook(({state})=>useStudyAnalytics(state),{initialProps:{state}})
    state=studyReducer(state,{type:'step',step:'old-task'});rerender({state})
    expect(events('study_method_started')).toEqual([])
    state=studyReducer(state,{type:'begin-step'});rerender({state})
    expect(events('study_method_started')).toHaveLength(1)
    expect(events('study_method_started')[0].context).toMatchObject({phase:'old-task',method:'old'})
    state=tick(state,250);rerender({state});rerender({state:{...state}})
    expect(events('study_started')).toHaveLength(1)
    expect(events('study_method_started')).toHaveLength(1)
    expect(events('study_phase_entered').map(event=>event.context.phase)).toEqual(['warmup','old-task'])
  })

  it('records each newly opened hint once with its method, ordinal and active elapsed time',()=>{
    let state=begin(started(),'old')
    const {rerender}=renderHook(({state})=>useStudyAnalytics(state),{initialProps:{state}})
    state=hint(tick(state,15000),'old');rerender({state})
    state=hint(tick(state,1000),'old');rerender({state})
    state=hint(tick(state,2000),'old');rerender({state})
    rerender({state:{...state}})
    const hints=events('study_hint_opened')
    expect(hints.map(event=>event.properties.help_open_count)).toEqual([1,2,3])
    expect(hints.map(event=>event.properties.elapsed_ms)).toEqual([15000,16000,18000])
    expect(hints.every(event=>event.properties.first_help_at_ms===15000)).toBe(true)
    expect(hints.every(event=>event.context.method==='old' && event.context.phase==='old-task')).toBe(true)
    expect(hints[0].properties).toMatchObject({hint_code:'apply_status_filter',map_mode:'complexes',status_filtered:false,map_view:'aggregate',detail_state:'none'})
    state=complete(state,'old');rerender({state})
    state=studyReducer(state,{type:'rate',value:4})
    state=begin(state,'new');rerender({state})
    state=hint(tick(state,15000),'new');rerender({state})
    expect(events('study_hint_opened')).toHaveLength(4)
    expect(events('study_hint_opened')[3]).toMatchObject({context:{method:'new',phase:'new-task'},properties:{help_open_count:1,first_help_at_ms:15000,hint_code:'zoom_into_area',map_mode:'announcements'}})
  })

  it('does not replay restored hint history and appends only the new opening',()=>{
    const saved=hint(tick(begin(started(),'old'),15000),'old')
    let state=restoreState(JSON.stringify(saved),'dataset-v1')!
    const {rerender}=renderHook(({state})=>useStudyAnalytics(state),{initialProps:{state}})
    expect(events('study_hint_opened')).toEqual([])
    expect(events('study_method_started')).toEqual([])
    state=hint(tick(state,2000),'old');rerender({state})
    expect(events('study_hint_opened')).toHaveLength(1)
    expect(events('study_hint_opened')[0].properties).toMatchObject({help_open_count:2,first_help_at_ms:15000,elapsed_ms:17000})
  })

  it('keeps a batched rating attached to its completed method and restores the current context for clicks',()=>{
    let state=begin(started(),'old')
    const {result,rerender}=renderHook(({state})=>useStudyAnalytics(state),{initialProps:{state}})
    state=complete(tick(state,10000),'old');rerender({state})
    expect(events('study_method_completed')[0]).toMatchObject({context:{method:'old',phase:'old-task'},properties:{outcome:'success',source:'filtered_complex',elapsed_ms:10000}})
    state=studyReducer(studyReducer(state,{type:'rate',value:4}),{type:'step',step:'new-task'})
    rerender({state})
    expect(events('study_method_rated')).toHaveLength(1)
    expect(events('study_method_rated')[0]).toMatchObject({context:{method:'old',phase:'old-task'},properties:{ease:4}})
    result.current('study_control_clicked',{control:'mode_announcements'})
    expect(events('study_control_clicked')[0].context).toMatchObject({phase:'new-task',method:'none'})
    state=studyReducer(state,{type:'begin-step'});rerender({state})
    result.current('study_control_clicked',{control:'announcement_pin'})
    expect(events('study_control_clicked')[1].context).toMatchObject({phase:'new-task',method:'new'})
    rerender({state:{...state}})
    expect(events('study_method_completed')).toHaveLength(1)
    expect(events('study_method_rated')).toHaveLength(1)
  })

  it('uses accepted completion sources and reports a verified submission only once',()=>{
    let state=begin(started(),'new')
    const {rerender}=renderHook(({state})=>useStudyAnalytics(state),{initialProps:{state}})
    const wrong=studyReducer(state,{type:'request-detail',requestId:'wrong',id:'1',source:'filtered_complex',complexId:'10001',applicationStatuses:['APPLYING']})
    state=studyReducer(wrong,{type:'success',requestId:'wrong',id:'1',status:'APPLYING'});rerender({state})
    expect(events('study_method_completed')).toEqual([])
    state=complete(state,'new');rerender({state})
    expect(events('study_method_completed')[0]).toMatchObject({context:{method:'new'},properties:{outcome:'success',source:'announcement_pin'}})
    state=studyReducer(studyReducer(state,{type:'rate',value:5}),{type:'step',step:'survey'});rerender({state})
    expect(events('study_survey_submitted')).toEqual([])
    state=studyReducer(state,{type:'submitted',responseId:'response-1'});rerender({state})
    rerender({state:{...state}})
    expect(events('study_survey_submitted')).toHaveLength(1)
    expect(events('study_survey_submitted')[0]).toMatchObject({context:{phase:'complete',method:'none'},properties:{}})
    expect(events('study_survey_submitted')[0].properties).not.toHaveProperty('responseId')
  })

  it('survives the StrictMode probe without stopping capture and stops once after real unmount',async()=>{
    const wrapper=({children}:{children:ReactNode})=><StrictMode>{children}</StrictMode>
    const {result,unmount}=renderHook(()=>useStudyPageVisit(),{wrapper})
    await act(async()=>{await Promise.resolve()})
    expect(collector.stop).not.toHaveBeenCalled()
    expect(collector.initialize).toHaveBeenCalledWith(expect.objectContaining({phase:'loading',method:'none',consent:null,sessionId:result.current.sessionId}))
    expect(events('study_started')).toHaveLength(0)
    expect(events('study_phase_entered')).toHaveLength(0)
    unmount()
    await act(async()=>{await Promise.resolve()})
    expect(collector.stop).toHaveBeenCalledTimes(1)
  })
})
