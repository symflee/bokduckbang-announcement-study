import { describe, expect, it } from 'vitest'
import { activeTrial, initialState, restoreState, studyReducer } from './state'
import { parseTallyEvent, tallyUrl } from './tallyAdapter'
import { makeSummary } from './state'
const start = ()=>({...initialState('data-v1','session-id'),step:'old-task' as const})
describe('study measurement',()=>{
  it.each(['old-task', 'new-task'] as const)('waits for an explicit start in %s, including after a reload', step => {
    const pending = studyReducer(initialState('data-v1', 'session'), {type:'step', step})
    expect(activeTrial(pending)).toBeNull()
    expect(studyReducer(pending, {type:'tick', milliseconds:70_000})).toEqual(pending)
    expect(studyReducer(pending, {type:'help', reason:'requested'})).toEqual(pending)
    const restored = restoreState(JSON.stringify(pending), 'data-v1')!
    const key = step === 'old-task' ? 'old' : 'new'
    expect(restored.stageStarted).toBe(false)
    expect(restored.trials[key].interrupted).toBe(false)
    const started = studyReducer(restored, {type:'begin-step'})
    expect(activeTrial(started)).toBe(key)
    expect(studyReducer(started, {type:'tick', milliseconds:2000}).trials[key].elapsedMs).toBe(2000)
    expect(restoreState(JSON.stringify(started), 'data-v1')?.trials[key].interrupted).toBe(true)
  })

  it('does not count a stale detail from the previous task as a new success',()=>{
    expect(studyReducer(start(),{type:'success',id:'1',status:'APPLYING'}).trials.old.outcome).toBe('active')
  })
  it('does not accept closed announcements or record time outside a task',()=>{
    const initial=initialState('data-v1','s')
    expect(studyReducer(initial,{type:'tick',milliseconds:9000})).toEqual(initial)
    expect(studyReducer(start(),{type:'success',id:'1',status:'CLOSED'}).trials.old.outcome).toBe('active')
  })
  it('distinguishes unaided and aided success, freezes completed trials',()=>{
    let state=studyReducer(start(),{type:'tick',milliseconds:4000})
    state=studyReducer(state,{type:'help',reason:'requested'})
    state=studyReducer(state,{type:'tick',milliseconds:3000})
    state=studyReducer(state,{type:'request-detail',id:'1'})
    state=studyReducer(state,{type:'success',id:'1',status:'APPLYING'})
    expect(state.trials.old).toMatchObject({elapsedMs:7000,helpAtMs:4000,helpReason:'requested',outcome:'success'})
    expect(studyReducer(state,{type:'tick',milliseconds:5000})).toEqual(state)
    expect(studyReducer(studyReducer(start(),{type:'request-detail',id:'2'}),{type:'success',id:'2',status:'BEFORE_APPLICATION'}).trials.old.helpAtMs).toBeNull()
  })
  it('automatically gives equal help after 60 visible seconds and deduplicates paths',()=>{
    let state=studyReducer(start(),{type:'tick',milliseconds:60_020})
    expect(state.trials.old).toMatchObject({helpAtMs:60000,helpReason:'timeout'})
    state=studyReducer(state,{type:'path',path:'filter'})
    state=studyReducer(state,{type:'path',path:'filter'})
    expect(state.trials.old.paths).toEqual(['filter'])
  })
  it('restores the same session but flags interrupted measurements; rejects incompatible and corrupt storage',()=>{
    const restored=restoreState(JSON.stringify(start()),'data-v1')
    expect(restored?.sessionId).toBe('session-id')
    expect(restored?.trials.old.interrupted).toBe(true)
    expect(restored?.trials.old.elapsedMs).toBe(0)
    expect(restoreState(JSON.stringify(start()),'data-v2')).toBeNull()
    expect(restoreState('{','data-v1')).toBeNull()
  })
  it('records skips, technical failures and retries separately',()=>{
    let state=studyReducer(start(),{type:'error'})
    state=studyReducer(state,{type:'retry'})
    state=studyReducer(state,{type:'skip'})
    expect(state.trials.old).toMatchObject({outcome:'skipped',errors:1,retries:1,interrupted:true})
  })
  it('sends identical metadata to embedded and external forms and validates event payloads',()=>{
    const summary=makeSummary(start(),'2026-10-14',false)
    const embedded=new URL(tallyUrl('abc123',summary,true))
    const external=new URL(tallyUrl('abc123',summary,false))
    for (const [key,value] of external.searchParams) expect(embedded.searchParams.get(key)).toBe(value)
    expect(parseTallyEvent('not json','abc123')).toBeNull()
    expect(parseTallyEvent({event:'Tally.FormSubmitted',payload:{formId:'other',id:'1'}},'abc123')).toBeNull()
    expect(parseTallyEvent({event:'Tally.FormSubmitted',payload:{formId:'abc123',id:'1'}},'abc123')).toEqual({event:'Tally.FormSubmitted',id:'1'})
  })
})
