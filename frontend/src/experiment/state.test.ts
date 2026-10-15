import { describe, expect, it } from 'vitest'
import { CONSENT_VERSION, activeTrial, initialState, makeSummary, readState, restoreState, saveState, studyReducer, type ExperimentState, type TrialKey } from './state'
import { parseTallyEvent, tallyUrl } from './tallyAdapter'
import type { StudyDetailRequest } from './explorerStudy'
import { EMPTY_HINT_CONTEXT, selectStudyHint } from './studyHints'
const started=()=>studyReducer(initialState('data-v2','session'),{type:'start-study'})
const start=(key:TrialKey='old'):ExperimentState=>({...started(),step:`${key}-task`})
const help={type:'help' as const,reason:'requested' as const,mode:'complexes' as const,context:EMPTY_HINT_CONTEXT,hintCode:selectStudyHint('old','complexes',EMPTY_HINT_CONTEXT).code}
const request: StudyDetailRequest={requestId:'request-1',id:'1',source:'filtered_complex',complexId:'10001',applicationStatuses:['BEFORE_APPLICATION','APPLYING']}
const show={type:'success' as const, requestId:request.requestId,id:'1',status:'APPLYING'}
const open=(state:ExperimentState, origin:Partial<StudyDetailRequest>={})=>studyReducer(state,{type:'request-detail',...request,...origin})
describe('study measurement',()=>{
  it('starts the introduction without recording consent and restores progress without consent',()=>{
    const initial=initialState('data-v2','session')
    const begun=studyReducer(initial,{type:'start-study'})
    expect(begun).toMatchObject({step:'warmup',stageStarted:true,consent:null})
    expect(studyReducer(begun,{type:'start-study'})).toBe(begun)
    for (const step of ['intro','warmup','explore','briefing','old-task','new-task','compare','survey','complete'] as const) {
      expect(restoreState(JSON.stringify({...begun,step}),'data-v2')).toMatchObject({step,consent:null})
    }
  })
  it('preserves valid earlier consent records and rejects malformed records',()=>{
    const initial=initialState('data-v2','session')
    expect(initial.consent).toBeNull()
    expect(studyReducer(initial,{type:'accept-consent',acceptedAt:'not-a-date'})).toBe(initial)
    const accepted=studyReducer(initial,{type:'accept-consent',acceptedAt:'2026-10-15T00:00:00.000Z'})
    expect(accepted).toMatchObject({step:'warmup',consent:{version:CONSENT_VERSION,acceptedAt:'2026-10-15T00:00:00.000Z'}})
    expect(restoreState(JSON.stringify(accepted),'data-v2')?.consent).toEqual(accepted.consent)
    expect(restoreState(JSON.stringify({...accepted,consent:undefined}),'data-v2')).toBeNull()
    expect(restoreState(JSON.stringify({...accepted,consent:{...accepted.consent,version:'previous'}}),'data-v2')).toBeNull()
    expect(restoreState(JSON.stringify({...accepted,consent:{...accepted.consent,acceptedAt:'2026-02-30T00:00:00.000Z'}}),'data-v2')).toBeNull()
    expect(restoreState(JSON.stringify(initial),'data-v2')?.consent).toBeNull()
    expect(studyReducer(accepted,{type:'accept-consent',acceptedAt:'2026-10-16T00:00:00.000Z'})).toBe(accepted)
  })
  it('reads the saved identity before the dataset loads while still rejecting a mismatched known dataset',()=>{
    const state=started()
    saveState(state)
    try {
      expect(readState()).toMatchObject({sessionId:state.sessionId,datasetVersion:'data-v2',consent:null})
      expect(readState('data-v2')).toMatchObject({sessionId:state.sessionId})
      expect(readState('different-data')).toBeNull()
      for (const datasetVersion of ['', '   ', undefined, 42]) {
        expect(restoreState(JSON.stringify({...state,datasetVersion}))).toBeNull()
      }
    } finally { sessionStorage.clear() }
  })
  it('restores hint history, snapshots context and rejects inconsistent records',()=>{
    const context={...EMPTY_HINT_CONTEXT}
    let state=studyReducer(start(),{type:'tick',milliseconds:15_000})
    state=studyReducer(state,{...help,context})
    context.statusFiltered=true
    expect(state.trials.old.hintOpens[0].context.statusFiltered).toBe(false)
    expect(restoreState(JSON.stringify(state),'data-v2')?.trials.old.hintOpens).toEqual(state.trials.old.hintOpens)
    const record=state.trials.old.hintOpens[0]
    for (const changes of [{activeElapsedMs:15_001},{activeElapsedMs:-1},{hintCode:'unknown'},{hintCode:'zoom_into_area'},
      {context:{...record.context,mapView:'unknown'}},{mode:'unknown'}]) {
      expect(restoreState(JSON.stringify({...state,trials:{...state.trials,old:{...state.trials.old,hintOpens:[{...record,...changes}]}}}),'data-v2')).toBeNull()
    }
    expect(restoreState(JSON.stringify({...state,trials:{...state.trials,old:{...state.trials.old,helpAtMs:0}}}),'data-v2')).toBeNull()
    expect(restoreState(JSON.stringify({...state,trials:{...state.trials,old:{...state.trials.old,hintOpens:[]}}}),'data-v2')).toBeNull()
    const completed=studyReducer(open(state),show)
    expect(studyReducer(completed,help)).toBe(completed)
  })
  it.each(['old-task','new-task'] as const)('does not measure the start modal for %s',step=>{
    const pending=studyReducer(started(),{type:'step',step})
    expect(activeTrial(pending)).toBeNull()
    expect(studyReducer(pending,{type:'tick',milliseconds:70_000})).toEqual(pending)
    const restored=restoreState(JSON.stringify(pending),'data-v2')!
    const key=step==='old-task'?'old':'new'
    expect(restored.trials[key].interrupted).toBe(false)
    const begun=studyReducer(restored,{type:'begin-step'})
    expect(studyReducer(begun,{type:'tick',milliseconds:2000}).trials[key].elapsedMs).toBe(2000)
  })
  it('always starts with filters and restores the fixed order',()=>{
    for(let i=0;i<10;i++) expect(initialState('data-v2',String(i)).order).toEqual(['old','new'])
    const state=initialState('data-v2','s')
    expect(restoreState(JSON.stringify(state),'data-v2')?.order).toEqual(['old','new'])
    expect(restoreState(JSON.stringify({...state,order:['new','old']}),'data-v2')).toBeNull()
  })
  it('does not complete the announcement-map trial through a filtered complex even after visiting its tab',()=>{
    let state=studyReducer(start('new'),{type:'path',path:'announcement_map'})
    state=open(state)
    expect(studyReducer(state,show).trials.new).toMatchObject({outcome:'active',wrongRoute:true})
  })
  it.each(['other','filtered_complex'] as const)('rejects %s for an announcement-map trial',source=>{
    expect(studyReducer(open(start('new'),{source}),show).trials.new.outcome).toBe('active')
  })
  it('requires the status filter captured at the complex pin, not a filter click history',()=>{
    const state=studyReducer(start(),{type:'path',path:'filter'})
    expect(studyReducer(open(state,{applicationStatuses:[]}),show).trials.old.outcome).toBe('active')
    expect(studyReducer(open(state,{applicationStatuses:['CLOSED']}),show).trials.old.outcome).toBe('active')
    expect(studyReducer(open(state,{complexId:null}),show).trials.old.outcome).toBe('active')
    expect(studyReducer(open(state),show).trials.old).toMatchObject({outcome:'success',completionSource:'filtered_complex'})
  })
  it('accepts a direct pin or a choice originating from that pin',()=>{
    const result=studyReducer(open(start('new'),{source:'announcement_pin',applicationStatuses:[]}),show)
    expect(result.trials.new).toMatchObject({outcome:'success',completionSource:'announcement_pin'})
  })
  it('rejects closed, mismatched and stale requests even for the same announcement',()=>{
    const state=open(start())
    expect(studyReducer(state,{...show,status:'CLOSED'}).trials.old.outcome).toBe('active')
    expect(studyReducer(state,{...show,id:'2'}).trials.old.outcome).toBe('active')
    expect(studyReducer(state,{...show,requestId:'previous-request'}).trials.old.outcome).toBe('active')
    expect(studyReducer(start(),show).trials.old.outcome).toBe('active')
  })
  it('never adds timeout help and counts only requested extra guidance',()=>{
    let state=start()
    state=studyReducer(state,{type:'tick',milliseconds:70_000})
    expect(state.trials.old).toMatchObject({helpAtMs:null,helpReason:null})
    state=studyReducer(state,help)
    state=studyReducer(state,{type:'tick',milliseconds:1000})
    state=studyReducer(state,help)
    expect(state.trials.old.helpAtMs).toBe(70000)
    expect(state.trials.old.hintOpens.map(hint=>hint.activeElapsedMs)).toEqual([70000,71000])
    expect(state.trials.new.hintOpens).toEqual([])
  })
  it('records one immediate rating after completion or skipping and freezes it during comparison',()=>{
    expect(studyReducer(start(),{type:'rate',value:5})).toEqual(start())
    let state=studyReducer(open(start()),show)
    state=studyReducer(state,{type:'rate',value:4})
    expect(studyReducer(state,{type:'rate',value:1}).trials.old.ease).toBe(4)
    expect(studyReducer(state,{type:'tick',milliseconds:3000}).trials.old.elapsedMs).toBe(0)
    state=studyReducer(state,{type:'step',step:'compare'})
    expect(studyReducer(state,{type:'rate',value:2}).trials.old.ease).toBe(4)
    const skipped=studyReducer(start('new'),{type:'skip'})
    expect(studyReducer(skipped,{type:'rate',value:'unsure'}).trials.new).toMatchObject({outcome:'skipped',ease:'unsure'})
  })
  it('restores order and rating but clears in-flight requests; rejects earlier versions and invalid values',()=>{
    const state=open(start())
    expect(restoreState(JSON.stringify(state),'data-v2')?.trials.old).toMatchObject({requestedDetail:null,interrupted:true})
    const rated=studyReducer(studyReducer(state,show),{type:'rate',value:3})
    expect(restoreState(JSON.stringify(rated),'data-v2')?.trials.old.ease).toBe(3)
    expect(restoreState(JSON.stringify({...state,version:'announcement-map-v7'}),'data-v2')).toBeNull()
    expect(restoreState(JSON.stringify({...state,order:['old','old']}),'data-v2')).toBeNull()
    expect(restoreState('{','data-v2')).toBeNull()
  })
  it('records errors and retries without completing a trial',()=>{
    const state=studyReducer(studyReducer(start(),{type:'error'}),{type:'retry'})
    expect(state.trials.old).toMatchObject({outcome:'active',errors:1,retries:1,interrupted:true})
  })
  it('keeps embedded and external survey metadata identical, keyed by method not ordinal',()=>{
    let state=studyReducer(start('new'),{type:'tick',milliseconds:15000})
    const newHelp={...help,hintCode:selectStudyHint('new','complexes',EMPTY_HINT_CONTEXT).code}
    state=studyReducer(studyReducer(state,newHelp),newHelp)
    state=studyReducer(studyReducer(open(state,{source:'announcement_pin'}),show),{type:'rate',value:5}) as typeof state
    const summary=makeSummary(state,'2026-10-14',false)
    const embedded=new URL(tallyUrl('abc',summary,true)), external=new URL(tallyUrl('abc',summary,false))
    for(const [key,value] of external.searchParams) expect(embedded.searchParams.get(key)).toBe(value)
    expect(external.searchParams.get('method_order')).toBe('old,new')
    expect(external.searchParams.get('ease_new')).toBe('5')
    expect(external.searchParams.get('new_completion_source')).toBe('announcement_pin')
    expect(external.searchParams.get('question_version')).toBe('survey-v3')
    expect(external.searchParams.get('old_help_open_count')).toBe('0')
    expect(external.searchParams.get('new_help_open_count')).toBe('2')
    expect(external.searchParams.get('new_help_at_ms')).toBe('15000')
    expect([...external.searchParams].length).toBe(36)
    expect(parseTallyEvent('not json','abc')).toBeNull()
    expect(parseTallyEvent({event:'Tally.FormSubmitted',payload:{formId:'other',id:'1'}},'abc')).toBeNull()
    expect(parseTallyEvent({event:'Tally.FormSubmitted',payload:{formId:'abc',id:'1'}},'abc')).toEqual({event:'Tally.FormSubmitted',id:'1'})
  })
})
