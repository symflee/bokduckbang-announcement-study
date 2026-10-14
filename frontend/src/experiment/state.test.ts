import { describe, expect, it, vi } from 'vitest'
import { activeTrial, initialState, makeSummary, randomMethodOrder, restoreState, studyReducer, type ExperimentState, type TrialKey } from './state'
import { parseTallyEvent, tallyUrl } from './tallyAdapter'
import type { StudyDetailRequest } from './explorerStudy'
const start=(key:TrialKey='old'):ExperimentState=>({...initialState('data-v2','session',false,['old','new']),step:`${key}-task`})
const request: StudyDetailRequest={requestId:'request-1',id:'1',source:'filtered_complex',complexId:'10001',applicationStatuses:['BEFORE_APPLICATION','APPLYING']}
const show={type:'success' as const, requestId:request.requestId,id:'1',status:'APPLYING'}
const open=(state:ExperimentState, origin:Partial<StudyDetailRequest>={})=>studyReducer(state,{type:'request-detail',...request,...origin})
describe('study measurement',()=>{
  it.each(['old-task','new-task'] as const)('does not measure the start modal for %s',step=>{
    const pending=studyReducer(initialState('data-v2','session'),{type:'step',step})
    expect(activeTrial(pending)).toBeNull()
    expect(studyReducer(pending,{type:'tick',milliseconds:70_000})).toEqual(pending)
    const restored=restoreState(JSON.stringify(pending),'data-v2')!
    const key=step==='old-task'?'old':'new'
    expect(restored.trials[key].interrupted).toBe(false)
    const begun=studyReducer(restored,{type:'begin-step'})
    expect(studyReducer(begun,{type:'tick',milliseconds:2000}).trials[key].elapsedMs).toBe(2000)
  })
  it('assigns either order and preserves it on refresh',()=>{
    const spy=vi.spyOn(crypto,'getRandomValues')
    spy.mockImplementationOnce(array=>{if(array instanceof Uint32Array) array[0]=0; return array})
    expect(randomMethodOrder()).toEqual(['old','new'])
    spy.mockImplementationOnce(array=>{if(array instanceof Uint32Array) array[0]=1; return array})
    expect(randomMethodOrder()).toEqual(['new','old'])
    spy.mockRestore()
    const state=initialState('data-v2','s',false,['new','old'])
    expect(restoreState(JSON.stringify(state),'data-v2')?.order).toEqual(['new','old'])
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
    let state=studyReducer(start(),{type:'initial-hint-dismissed'})
    state=studyReducer(state,{type:'tick',milliseconds:70_000})
    expect(state.trials.old).toMatchObject({helpAtMs:null,helpReason:null})
    state=studyReducer(state,{type:'help',reason:'requested'})
    state=studyReducer(state,{type:'tick',milliseconds:1000})
    expect(studyReducer(state,{type:'help',reason:'requested'}).trials.old.helpAtMs).toBe(70000)
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
    expect(restoreState(JSON.stringify({...state,version:'announcement-map-v3'}),'data-v2')).toBeNull()
    expect(restoreState(JSON.stringify({...state,order:['old','old']}),'data-v2')).toBeNull()
    expect(restoreState('{','data-v2')).toBeNull()
  })
  it('records errors and retries without completing a trial',()=>{
    const state=studyReducer(studyReducer(start(),{type:'error'}),{type:'retry'})
    expect(state.trials.old).toMatchObject({outcome:'active',errors:1,retries:1,interrupted:true})
  })
  it('keeps embedded and external survey metadata identical, keyed by method not ordinal',()=>{
    let state={...start('new'),order:['new','old'] as const}
    state=studyReducer(studyReducer(open(state,{source:'announcement_pin'}),show),{type:'rate',value:5}) as typeof state
    const summary=makeSummary(state,'2026-10-14',false)
    const embedded=new URL(tallyUrl('abc',summary,true)), external=new URL(tallyUrl('abc',summary,false))
    for(const [key,value] of external.searchParams) expect(embedded.searchParams.get(key)).toBe(value)
    expect(external.searchParams.get('method_order')).toBe('new,old')
    expect(external.searchParams.get('ease_new')).toBe('5')
    expect(external.searchParams.get('new_completion_source')).toBe('announcement_pin')
    expect(external.searchParams.get('question_version')).toBe('survey-v2')
    expect(parseTallyEvent('not json','abc')).toBeNull()
    expect(parseTallyEvent({event:'Tally.FormSubmitted',payload:{formId:'other',id:'1'}},'abc')).toBeNull()
    expect(parseTallyEvent({event:'Tally.FormSubmitted',payload:{formId:'abc',id:'1'}},'abc')).toEqual({event:'Tally.FormSubmitted',id:'1'})
  })
})
