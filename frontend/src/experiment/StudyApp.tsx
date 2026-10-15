import { flushSync } from 'react-dom'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { clearDetailQuery, setComplexIdQuery, setAnnouncementIdQuery, parseDetailLocation } from '../public-housing/navigation/detailLocation'
import { PublicHousingExplorer } from '../public-housing/PublicHousingExplorer'
import { announcementsByComplex, createStudyRepositories, loadStudyDataset, type MapMode, type StudyDataset } from './data'
import type { ExplorerStudyEvent, StudyHintContext } from './explorerStudy'
import { activeTrial, hasStepIntroduction, initialState, makeSummary, readState, saveState, studyReducer, METHOD_NAMES, type EaseRating, type StudyAction, type StudyStep } from './state'
import { TallySurvey } from './TallySurvey'
import { StudyMapBoundary } from './StudyMapBoundary'
import { StudyStepIntroduction } from './StudyStepIntroduction'
import { StudyRating } from './StudyRating'
import { StudySpotlight } from './StudySpotlight'
import { StudyExplorePrompt, StudyWelcome } from './StudyEntryDialogs'
import { useStudyAnalytics, useStudyPageVisit } from './useStudyAnalytics'
import { SERVICE_TOUR } from './serviceTour'
import { EMPTY_HINT_CONTEXT, HINT_DELAY_MS, selectStudyHint } from './studyHints'

const SEOUL = '/?mapLat=37.5665&mapLng=126.978&mapZoom=11'
export function StudyApp() {
  const visit=useStudyPageVisit()
  const [dataset,setDataset] = useState<StudyDataset | null>(null)
  const [error,setError] = useState(false)
  const [revision,setRevision] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    loadStudyDataset(abort.signal).then(setDataset).catch(()=>{if (!abort.signal.aborted) setError(true)})
    return () => abort.abort()
  },[revision])
  if (!dataset) return <main className="study-loading"><img src="/logo-bok-search.svg" alt="복덕방" width="48" /><h1>공공주택 지도 체험</h1>{error ? <><p role="alert">예시 데이터를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.</p><button onClick={()=>{setError(false);setRevision(r=>r+1)}}>다시 불러오기</button></> : <p role="status">체험 지도를 준비하고 있습니다…</p>}</main>
  return <StudyExperience dataset={dataset} visit={visit} />
}
function StudyExperience({dataset,visit}:{dataset:StudyDataset;visit:ReturnType<typeof useStudyPageVisit>}) {
  const navigate = useNavigate()
  const {search} = useLocation()
  const searchRef=useRef(search)
  searchRef.current=search
  const [state,dispatch] = useReducer(studyReducer, dataset.datasetVersion, version => readState(version) ?? initialState(version,visit.sessionId,visit.test))
  const capture=useStudyAnalytics(state)
  const [mode,setMode] = useState<MapMode>('complexes')
  const [mapKey,setMapKey] = useState(0)
  const [ready,setReady] = useState(false)
  const [collapsed,setCollapsed] = useState(false)
  const [explorePromptOpen,setExplorePromptOpen] = useState(true)
  const [resume,setResume] = useState(()=>Boolean(activeTrial(state) && state.trials[activeTrial(state)!].interrupted && state.trials[activeTrial(state)!].outcome === 'active'))
  const [hintOpen,setHintOpen] = useState(false)
  const [hintContext,setHintContext] = useState<StudyHintContext>(EMPTY_HINT_CONTEXT)
  const hintContextRef = useRef(EMPTY_HINT_CONTEXT)
  const introduction = !state.stageStarted && hasStepIntroduction(state.step) ? state.step : null
  const stateRef = useRef(state)
  const readyRef = useRef(false)
  const pausedRef = useRef(resume)
  const eventBlockedRef = useRef(resume)
  const lastTick = useRef(performance.now())
  stateRef.current = state
  const key = activeTrial(state)
  const trial = key ? state.trials[key] : null
  const newAvailable = ['new-task','compare','survey','complete'].includes(state.step)
  const ratingOpen = trial && trial.outcome !== 'active' && trial.ease === null
  const ordinal = key ? state.order.indexOf(key)+1 : 3
  eventBlockedRef.current = resume || introduction !== null || Boolean(ratingOpen)
  pausedRef.current = resume || introduction !== null || hintOpen || Boolean(ratingOpen)
  const touring = state.step === 'warmup' && state.stageStarted
  const repositories = useMemo(()=>createStudyRepositories(dataset,mode),[dataset,mode])
  const announcements = useMemo(()=>announcementsByComplex(dataset.snapshot),[dataset])
  const tourComplex=dataset.snapshot.mapComplexItems.find(item=>announcements[item.complexId]?.length)
  const selectedTourComplex=useRef<string | null>(null)
  const previousTourStep=useRef<number | null>(null)
  const previousTourDetail=useRef<string | null>(null)
  const tourListRequested=useRef(false)
  const pinsIntroduction=SERVICE_TOUR.findIndex(tip=>tip.view==='pins')
  const tourCamera=tourComplex && state.tourStep>=pinsIntroduction ? {latitude:tourComplex.latitude,longitude:tourComplex.longitude,zoom:13} : undefined
  // Keep the map mounted; only change the detail needed by the current explanation.
  useEffect(()=>{
    if (!touring || !tourComplex) {previousTourStep.current=null;return}
    const stepChanged=previousTourStep.current!==state.tourStep
    previousTourStep.current=state.tourStep
    if(stepChanged) tourListRequested.current=false
    const view=SERVICE_TOUR[state.tourStep].view
    const currentParams=new URLSearchParams(searchRef.current)
    const selected=parseDetailLocation(currentParams)
    const signature=JSON.stringify(selected)
    const detailChanged=previousTourDetail.current!==signature
    previousTourDetail.current=signature
    if(selected.kind==='complex' && announcements[selected.complexId]?.length) selectedTourComplex.current=selected.complexId
    const complexId=selectedTourComplex.current ?? String(tourComplex.complexId)
    if(!stepChanged) {
      if(!detailChanged) return
      // Follow manual close/back/detail links instead of leaving a guide over a missing panel.
      let nextView: typeof view
      if(view==='complex' || view==='complex-announcement') {
        if(selected.kind==='none') nextView='pins'
        if(selected.kind==='announcement') nextView='announcement'
      }
      if(view==='announcement' || view==='list-announcement') {
        if(selected.kind==='none') nextView=view==='announcement' ? 'complex-announcement' : 'list'
        if(selected.kind==='complex') nextView='complex'
      }
      if(nextView) {
        const index=SERVICE_TOUR.findIndex(tip=>tip.view===nextView && !tip.pinLegend)
        dispatch({type:'tour-step',index})
      }
      return
    }
    let params=clearDetailQuery(currentParams)
    if(view==='complex' || view==='complex-announcement') params=setComplexIdQuery(params,complexId)
    if(view==='announcement' || view==='list-announcement') {
      params=setAnnouncementIdQuery(params,selected.kind==='announcement' ? selected.announcementId : announcements[complexId][0].id)
    }
    if(params.toString()!==currentParams.toString()) navigate(`/?${params}`,{replace:true})
  },[touring,state.tourStep,search,tourComplex,announcements,navigate])
  const flush = useCallback(() => {
    const now = performance.now()
    const elapsed = now-lastTick.current
    lastTick.current = now
    if (readyRef.current && !pausedRef.current && document.visibilityState !== 'hidden') dispatch({type:'tick',milliseconds:elapsed})
  },[])
  const send = useCallback((action:StudyAction) => {flush();dispatch(action)},[flush])
  useEffect(()=>{saveState(state)},[state])
  useEffect(()=>{
    let visible = document.visibilityState !== 'hidden'
    const timer = window.setInterval(flush,250)
    function visibility() {
      const now = performance.now()
      if (visible && readyRef.current && !pausedRef.current) dispatch({type:'tick',milliseconds:now-lastTick.current})
      lastTick.current = now
      visible = document.visibilityState !== 'hidden'
    }
    function persist() {saveState(stateRef.current)}
    document.addEventListener('visibilitychange',visibility)
    window.addEventListener('pagehide',persist)
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',persist)}
  },[flush])
  const onEvent = useCallback((event:ExplorerStudyEvent) => {
    if(event.type==='control') {
      capture('study_control_clicked',{control:event.control})
      if(stateRef.current.step==='warmup' && SERVICE_TOUR[stateRef.current.tourStep].target==='#announcement-list-trigger') {
        tourListRequested.current=event.control==='announcement_list_toggle'
      }
      return
    }
    if (event.type === 'context') {
      const current=stateRef.current
      if(current.step==='warmup') {
        const tip=SERVICE_TOUR[current.tourStep]
        const progressed=tip.advanceOnTarget && (
          tip.view==='pins' && event.context.detail==='complex-active' && hintContextRef.current.detail!=='complex-active'
          || tip.view==='complex-announcement' && event.context.detail==='announcement' && hintContextRef.current.detail!=='announcement'
          || tip.target==='#announcement-list-trigger' && tourListRequested.current && event.context.listOpen
        )
        if(progressed || tip.view==='list' && event.context.detail==='announcement' && hintContextRef.current.detail!=='announcement') dispatch({type:'tour-step',index:current.tourStep+1})
      }
      if (JSON.stringify(event.context) !== JSON.stringify(hintContextRef.current)) {
        flush();setHintOpen(false);hintContextRef.current=event.context;setHintContext(event.context)
      }
      return
    }
    if (event.type === 'ready') {flush();readyRef.current=event.ready;setReady(event.ready);return}
    if (event.type === 'error') {
      capture('study_error',{surface:event.surface})
      if(event.surface !== 'detail') {flush();readyRef.current=false;setReady(false)}
    }
    if (eventBlockedRef.current) return
    if (event.type === 'path' || event.type === 'request-detail') {send(event);setHintOpen(false)}
    if (event.type === 'detail') {
      const active=activeTrial(stateRef.current)
      capture('study_announcement_opened',{status:event.status,source:active
        ? stateRef.current.trials[active].requestedDetail?.source : 'other'}, {dedupeKey:`detail:${event.requestId}`})
      send({type:'success',requestId:event.requestId,id:event.id,status:event.status})
    }
    if (event.type === 'retry') {capture('study_retry');send(event)}
    if (event.type === 'error') send({type:'error'})
  },[flush,send,capture])
  function next(step:StudyStep) {
    flush()
    if (['old-task','new-task'].includes(step)) {
      readyRef.current=false;setReady(false);setMode('complexes');flushSync(()=>navigate(SEOUL,{replace:true}));setMapKey(k=>k+1)
    }
    if (step === 'explore' || step === 'compare' || step === 'survey') {
      // Close the native mobile detail before returning focus to the map or survey.
      flushSync(()=>navigate(`/?${clearDetailQuery(new URLSearchParams(search))}`,{replace:true}))
    }
    setCollapsed(false);setHintOpen(false);dispatch({type:'step',step})
  }
  function rate(value:EaseRating) {
    if (!key) return
    dispatch({type:'rate',value})
    next(ordinal === 1 ? `${state.order[1]}-task` : 'survey')
  }
  const onSubmitted = useCallback((responseId:string)=>dispatch({type:'submitted',responseId}),[])
  const summary = useMemo(()=>makeSummary(state,dataset.asOf,window.matchMedia('(max-width: 767px)').matches),[state,dataset.asOf])
  function showTourStep(index:number) {
    capture('study_control_clicked',{control:index<state.tourStep ? 'tour_previous' : 'tour_next'})
    dispatch({type:'tour-step',index})
  }
  const guideAnnouncementTab=key === 'new' && Boolean(trial?.wrongRoute) && !resume && !ratingOpen
    && (mode !== 'announcements' || hintContext.detail === 'announcement' || hintContext.listOpen)
  const hintAvailable=ready && Boolean(trial && trial.elapsedMs >= HINT_DELAY_MS)
  const currentHint=key ? selectStudyHint(key,mode,hintContext) : null
  return <div className={`app-shell study-shell ${touring ? 'is-service-tour' : ''} ${guideAnnouncementTab ? 'is-study-route-guidance' : ''}`}>
    <div className="study-map" onPointerDownCapture={()=>{if(hintOpen){flush();setHintOpen(false)}}} onKeyDownCapture={()=>{if(hintOpen){flush();setHintOpen(false)}}} inert={['intro','briefing','survey','complete'].includes(state.step) || state.step==='explore' && explorePromptOpen || resume || introduction !== null || Boolean(ratingOpen)}>
      <StudyMapBoundary key={mapKey} ready={ready} onFailure={()=>onEvent({type:'error',surface:'map'})} onRetry={()=>{capture('study_retry');flushSync(()=>send({type:'retry'}));saveState(stateRef.current);window.location.reload()}}>
      <PublicHousingExplorer {...repositories} showWelcome={false} streetViewSupported={false}
        study={{mode,newModeAvailable:newAvailable,guideAnnouncementTab,announcements,tourStep:touring ? state.tourStep : undefined,tourCamera:touring ? tourCamera : undefined,onModeChange:nextMode=>{capture('study_control_clicked',{control:nextMode==='announcements'?'mode_announcements':'mode_complexes'});flush();setHintOpen(false);setMode(nextMode)},onEvent}} />
      </StudyMapBoundary>
    </div>
    {mode === 'announcements' && <div className="study-mode-legend">숫자 = 공고가 있는 단지 수</div>}
    <div className="study-data-notice">체험용 예시 데이터 · 실제 모집정보가 아닙니다 · 기준일 {dataset.asOf}</div>
    {state.test && <span className="study-test-label">테스트 세션 · 분석 제외</span>}
    {state.step === 'intro' && <StudyWelcome onStart={()=>dispatch({type:'start-study'})} />}
    {state.step === 'explore' && (explorePromptOpen
      ? <StudyExplorePrompt onStart={()=>{capture('study_control_clicked',{control:'survey_start'});next('briefing')}}
        onExplore={()=>{capture('study_control_clicked',{control:'explore_more'});setExplorePromptOpen(false);requestAnimationFrame(()=>document.getElementById('study-explore-start')?.focus())}} />
      : <button id="study-explore-start" className="study-primary study-explore-start" onClick={()=>setExplorePromptOpen(true)}>설문 시작하기</button>)}
    {state.step === 'briefing' && <div className="study-modal-backdrop"><section className="study-intro" role="dialog" aria-modal="true" aria-labelledby="study-title">
      <span className="study-eyebrow">두 방법 비교·설문 · 약 4~6분</span>
      <h1 id="study-title">공고를 찾는 두 가지 방법,<br />직접 써 보고 알려 주세요.</h1>
      <p>지금까지는 <strong>공공주택 단지가 어디에 있는지</strong> 살펴봤어요.</p><p>이제 <strong>현재 모집공고가 열려 있는 단지</strong>를 두 방법으로 찾아보고, 더 와닿는 방법을 알려 주세요.</p>
      <p className="study-muted">체험용 예시 데이터입니다. 페이지에 접속한 시점부터 체험 기록과 화면 조작 과정을 수집합니다. 설문 응답은 임의 참여번호로 체험 결과와 연결합니다.</p>
      {!import.meta.env.VITE_TALLY_FORM_ID && <p className="study-setup-notice">사전 점검 버전: 설문 제출 연결을 준비하고 있습니다.</p>}
      <button className="study-primary" autoFocus onClick={()=>next(`${state.order[0]}-task`)}>첫 번째 방법 알아보기 <span aria-hidden="true">→</span></button>
    </section></div>}
    {resume && <div className="study-modal-backdrop"><section className="study-intro" role="dialog" aria-modal="true" aria-label="체험 이어하기"><h1>진행 중이던 체험이 있어요</h1><p>같은 참여번호로 이어갑니다. 페이지를 떠나 있던 시간은 제외하고, 이 과제는 중단 후 재개한 기록으로 구분합니다.</p><button className="study-primary" autoFocus onClick={()=>{lastTick.current=performance.now();setResume(false)}}>이어서 체험하기</button></section></div>}
    {introduction && <StudyStepIntroduction key={introduction} step={introduction} order={state.order} onStart={()=>{lastTick.current=performance.now();dispatch({type:'begin-step'})}} />}
    {key !== null && !resume && !introduction && !ratingOpen && <aside className={`study-task-card ${collapsed ? 'is-collapsed' : ''}`} aria-label="체험 과제">
      <div className="study-task-heading"><span className="study-eyebrow">{ordinal} / 3 · {key ? METHOD_NAMES[key] : '비교·설문'}</span><button onClick={()=>setCollapsed(c=>!c)} aria-expanded={!collapsed} aria-label={collapsed ? '과제 펼치기' : '과제 접기'}>{collapsed ? '＋' : '−'}</button></div>
      {!collapsed && <>
        {trial && key ? <><h2>{trial.wrongRoute ? '공고 내용은 확인했어요.' : '진행 중인 모집공고를 열어 보세요.'}</h2>
          <p id="study-route-guidance" role={trial.wrongRoute ? 'status' : undefined}>{!ready ? '지도와 데이터를 준비하고 있습니다.' : trial.wrongRoute
            ? key === 'new' ? '이번에는 공고지도에서 핀을 통해 공고를 찾아 보세요.' : '이번에는 모집상태 필터를 적용하고, 단지지도 핀에서 모집공고를 열어 보세요.'
            : `${METHOD_NAMES[key]} 방법을 직접 사용해 보세요. 막히면 힌트를 확인할 수 있어요.`}</p>
          <div className="study-actions"><button className="study-hint-button" disabled={!hintAvailable} aria-expanded={hintOpen} aria-controls="study-current-hint" onClick={()=>{
            flush();if(!hintOpen && currentHint) dispatch({type:'help',reason:'requested',mode,context:hintContext,hintCode:currentHint.code});setHintOpen(open=>!open)
          }}>힌트 보기</button></div>
          {hintOpen && <p id="study-current-hint" className="study-current-hint" role="note" aria-label="현재 상황 힌트">{currentHint?.text}</p>}
          {trial.errors > 0 && <p className="study-muted">연결 오류가 기록되었습니다. 지도 오류 안내의 다시 시도를 이용해 주세요.</p>}
        </> : null}
      </>}
    </aside>}
    {state.step === 'compare' && <button className="study-return-survey study-primary" onClick={()=>next(state.responseId ? 'complete' : 'survey')}>{state.responseId ? '참여 완료 화면' : '설문으로 돌아가기'}</button>}
    {ratingOpen && key && <StudyRating method={key} ordinal={ordinal} skipped={trial.outcome === 'skipped'} onRate={rate} />}
    {touring && ready && <StudySpotlight key={`tour-${state.tourStep}`} tip={SERVICE_TOUR[state.tourStep]} index={state.tourStep} total={SERVICE_TOUR.length} label="서비스 소개"
      nextLabel={SERVICE_TOUR[state.tourStep].nextLabel}
      onPrevious={()=>showTourStep(state.tourStep-1)}
      onNext={()=>{if(state.tourStep === SERVICE_TOUR.length-1) {capture('study_control_clicked',{control:'tour_next'});next('explore')} else showTourStep(state.tourStep+1)}} />}
    {touring && !ready && <aside className="study-task-card" role="status">지도와 화면을 준비하고 있습니다…</aside>}
    {state.step === 'survey' && <div className="study-modal-backdrop"><section className="study-survey" role="dialog" aria-modal="true" aria-label="체험 설문"><div className="study-survey-heading"><div><span className="study-eyebrow">3 / 3 · 비교·설문</span><h1>직접 써 보니 어땠나요?</h1></div><button onClick={()=>next('compare')}>지도로 돌아가기</button></div><TallySurvey summary={summary} onSubmitted={onSubmitted} /></section></div>}
    {state.step === 'complete' && <div className="study-modal-backdrop"><section className="study-intro" role="status"><span className="study-eyebrow">참여 완료</span><h1>의견을 남겨 주셔서 감사합니다.</h1><p>남겨 주신 의견은 공고를 더 쉽게 찾는 방법을 검토하는 데 사용할게요.</p><p className="study-muted">체험 화면은 예시 데이터이며 실제 신청에 사용할 수 없습니다.</p><button className="study-primary" onClick={()=>next('compare')}>지도 더 둘러보기</button></section></div>}
  </div>
}
