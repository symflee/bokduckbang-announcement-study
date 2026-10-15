import { useCallback, useEffect, useRef } from 'react'
import { activeTrial, QUESTION_VERSION, type ExperimentState } from './state'
import {
  captureStudyEvent, initializeStudyAnalytics, stopStudyAnalytics, updateStudyAnalyticsContext,
} from './studyAnalytics'

function context(state:ExperimentState) {
  return {sessionId:state.sessionId,experimentVersion:state.version,questionVersion:QUESTION_VERSION,
    datasetVersion:state.datasetVersion,order:state.order,test:state.test,
    screen:window.matchMedia('(max-width: 767px)').matches ? 'mobile' as const : 'desktop' as const,
    phase:state.step,method:activeTrial(state) ?? 'none' as const,consent:state.consent}
}

/** State transitions are observed after commit; restored hint history is never replayed. */
export function useStudyAnalytics(state:ExperimentState) {
  const current=useRef(state)
  current.current=state
  const previous=useRef(state)
  const phase=useRef('')
  const tour=useRef(-1)
  const lifecycle=useRef(0)
  const started=useRef(false)
  useEffect(()=>{
    const generation=++lifecycle.current
    const stopIfUnmounted=()=>{if(lifecycle.current===generation) stopStudyAnalytics()}
    return ()=>{queueMicrotask(stopIfUnmounted)}
  },[])
  useEffect(()=>{
    const before=previous.current
    previous.current=state
    if(!state.consent) return
    void initializeStudyAnalytics(context(state))
    if(!started.current) {
      started.current=true
      captureStudyEvent('study_started',{consent_version:state.consent.version,consented_at:state.consent.acceptedAt}, {dedupeKey:'started'})
    }
    if(phase.current!==state.step) {
      phase.current=state.step
      captureStudyEvent('study_phase_entered')
    }
    if(state.step==='warmup' && state.tourStep!==tour.current) {
      tour.current=state.tourStep
      captureStudyEvent('study_tour_step_viewed',{tour_step:state.tourStep+1})
    }
    const method=activeTrial(state)
    if(method && (!activeTrial(before) || before.step!==state.step)) {
      captureStudyEvent('study_method_started',{}, {dedupeKey:`started:${method}`})
    }
    for(const key of ['old','new'] as const) {
      const trial=state.trials[key], old=before.trials[key]
      updateStudyAnalyticsContext({...context(state),phase:`${key}-task`,method:key})
      for(let index=old.hintOpens.length;index<trial.hintOpens.length;index++) {
        const hint=trial.hintOpens[index]
        captureStudyEvent('study_hint_opened',{
          help_open_count:index+1,first_help_at_ms:trial.helpAtMs,elapsed_ms:hint.activeElapsedMs,
          hint_code:hint.hintCode,map_mode:hint.mode,status_filtered:hint.context.statusFiltered,
          map_view:hint.context.mapView,detail_state:hint.context.detail,
          complex_from_filtered_pin:hint.context.complexFromFilteredPin,
          choices_open:hint.context.choicesOpen,list_open:hint.context.listOpen,
        }, {dedupeKey:`hint:${key}:${index+1}`})
      }
      if(old.outcome==='active' && trial.outcome!=='active') {
        captureStudyEvent('study_method_completed',{outcome:trial.outcome,source:trial.completionSource,
          elapsed_ms:trial.elapsedMs,help_open_count:trial.hintOpens.length,errors:trial.errors,retries:trial.retries},
        {dedupeKey:`completed:${key}`})
      }
      if(old.ease===null && trial.ease!==null) {
        // Rating can advance to the next method in the same React batch.
        captureStudyEvent('study_method_rated',{ease:trial.ease},{dedupeKey:`rated:${key}`})
      }
    }
    updateStudyAnalyticsContext(context(state))
    if(!before.responseId && state.responseId) {
      captureStudyEvent('study_survey_submitted',{}, {dedupeKey:'survey-submitted'})
    }
  },[state])
  return useCallback((...args:Parameters<typeof captureStudyEvent>)=>{
    updateStudyAnalyticsContext(context(current.current))
    return captureStudyEvent(...args)
  },[])
}
