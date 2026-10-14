import { flushSync } from 'react-dom'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { PublicHousingExplorer } from '../public-housing/PublicHousingExplorer'
import { announcementsByComplex, createStudyRepositories, loadStudyDataset, type MapMode, type StudyDataset } from './data'
import type { ExplorerStudyEvent, StudyHintContext } from './explorerStudy'
import { activeTrial, hasStepIntroduction, initialState, makeSummary, readState, saveState, studyReducer, METHOD_NAMES, type EaseRating, type StudyAction, type StudyStep } from './state'
import { TallySurvey } from './TallySurvey'
import { StudyMapBoundary } from './StudyMapBoundary'
import { StudyStepIntroduction } from './StudyStepIntroduction'
import { StudyRating } from './StudyRating'
import { StudySpotlight } from './StudySpotlight'
import { SERVICE_TOUR } from './serviceTour'
import { EMPTY_HINT_CONTEXT, HINT_DELAY_MS, studyHint } from './studyHints'
import { setComplexSearchFilters } from '../public-housing/filters/searchFilterLocation'

const SEOUL = '/?mapLat=37.5665&mapLng=126.978&mapZoom=11'
export function StudyApp() {
  const [dataset,setDataset] = useState<StudyDataset | null>(null)
  const [error,setError] = useState(false)
  const [revision,setRevision] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    loadStudyDataset(abort.signal).then(setDataset).catch(()=>{if (!abort.signal.aborted) setError(true)})
    return () => abort.abort()
  },[revision])
  if (!dataset) return <main className="study-loading"><img src="/logo-bok-search.svg" alt="복덕방" width="48" /><h1>공공주택 지도 체험</h1>{error ? <><p role="alert">예시 데이터를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.</p><button onClick={()=>{setError(false);setRevision(r=>r+1)}}>다시 불러오기</button></> : <p role="status">체험 지도를 준비하고 있습니다…</p>}</main>
  return <StudyExperience dataset={dataset} />
}
function StudyExperience({dataset}:{dataset:StudyDataset}) {
  const navigate = useNavigate()
  const [state,dispatch] = useReducer(studyReducer, dataset.datasetVersion, version => readState(version) ?? initialState(version,crypto.randomUUID(),new URLSearchParams(location.search).get('test') === '1'))
  const [mode,setMode] = useState<MapMode>('complexes')
  const [mapKey,setMapKey] = useState(0)
  const [ready,setReady] = useState(false)
  const [collapsed,setCollapsed] = useState(false)
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
    if (event.type === 'context') {
      if (JSON.stringify(event.context) !== JSON.stringify(hintContextRef.current)) {
        flush();setHintOpen(false);hintContextRef.current=event.context;setHintContext(event.context)
      }
      return
    }
    if (event.type === 'ready') {flush();readyRef.current=event.ready;setReady(event.ready);return}
    if (event.type === 'error' && event.surface !== 'detail') {flush();readyRef.current=false;setReady(false)}
    if (eventBlockedRef.current) return
    if (event.type === 'path' || event.type === 'request-detail') {send(event);setHintOpen(false)}
    if (event.type === 'detail') send({type:'success',requestId:event.requestId,id:event.id,status:event.status})
    if (event.type === 'retry') send(event)
    if (event.type === 'error') send({type:'error'})
  },[flush,send])
  function next(step:StudyStep) {
    flush()
    if (['old-task','new-task','warmup','explore'].includes(step)) {
      readyRef.current=false;setReady(false);setMode('complexes');flushSync(()=>navigate(SEOUL,{replace:true}));setMapKey(k=>k+1)
    }
    setCollapsed(false);setHintOpen(false);dispatch({type:'step',step})
  }
  function rate(value:EaseRating) {
    if (!key) return
    dispatch({type:'rate',value})
    next(ordinal === 1 ? `${state.order[1]}-task` : 'compare')
  }
  const onSubmitted = useCallback((responseId:string)=>dispatch({type:'submitted',responseId}),[])
  const summary = useMemo(()=>makeSummary(state,dataset.asOf,window.matchMedia('(max-width: 767px)').matches),[state,dataset.asOf])
  function showTourStep(index:number) {
    const params=setComplexSearchFilters(new URLSearchParams(SEOUL.split('?')[1]),
      index >= 3 && index <= 5 ? {applicationStatuses:['BEFORE_APPLICATION','APPLYING']} : {})
    navigate(`/?${params}`,{replace:true})
    dispatch({type:'tour-step',index})
  }
  const hintAvailable=ready && Boolean(trial && trial.elapsedMs >= HINT_DELAY_MS)
  return <div className="app-shell study-shell">
    <div className="study-map" onPointerDownCapture={()=>{if(hintOpen){flush();setHintOpen(false)}}} onKeyDownCapture={()=>{if(hintOpen){flush();setHintOpen(false)}}} inert={['intro','briefing','survey','complete'].includes(state.step) || resume || introduction !== null || Boolean(ratingOpen)}>
      <StudyMapBoundary key={mapKey} ready={ready} onFailure={()=>onEvent({type:'error',surface:'map'})} onRetry={()=>{flushSync(()=>send({type:'retry'}));saveState(stateRef.current);window.location.reload()}}>
      <PublicHousingExplorer {...repositories} showWelcome={false} streetViewSupported={false}
        study={{mode,newModeAvailable:newAvailable,announcements,tourStep:touring ? state.tourStep : undefined,onModeChange:nextMode=>{flush();setHintOpen(false);setMode(nextMode)},onEvent}} />
      </StudyMapBoundary>
    </div>
    {mode === 'announcements' && <div className="study-mode-legend">숫자 = 공고가 있는 단지 수</div>}
    <div className="study-data-notice">체험용 예시 데이터 · 실제 모집정보가 아닙니다 · 기준일 {dataset.asOf}</div>
    {state.test && <span className="study-test-label">테스트 세션 · 분석 제외</span>}
    {state.step === 'intro' && <div className="study-modal-backdrop"><section className="study-intro" role="dialog" aria-modal="true" aria-labelledby="study-welcome-title">
      <img src="/logo-bok-search.svg" alt="복덕방" width="48" height="48" />
      <span className="study-eyebrow">공공주택 지도 · 복덕방</span>
      <h1 id="study-welcome-title">설문을 시작하기 전에,<br />서비스를 간단히 소개할게요.</h1>
      <p>공공주택 단지와 모집공고를 지도에서 찾아보는 서비스예요. 주요 기능을 함께 살펴본 뒤, 잠깐 자유롭게 사용해 보세요.</p>
      <p>준비가 되면 두 가지 방법을 체험하고 의견을 남기는 설문을 시작할 수 있어요.</p>
      <p className="study-muted">지금 보이는 단지·위치·모집조건은 임시로 넣은 체험용 데이터입니다.</p>
      <button className="study-primary" autoFocus onClick={()=>next('warmup')}>서비스 소개 보기 <span aria-hidden="true">→</span></button>
    </section></div>}
    {state.step === 'explore' && <aside className={`study-task-card ${collapsed ? 'is-collapsed' : ''}`} aria-label="자유롭게 둘러보기">
      <div className="study-task-heading"><span className="study-eyebrow">설문 시작 전 · 자유 탐색</span><button onClick={()=>setCollapsed(c=>!c)} aria-expanded={!collapsed} aria-label={collapsed ? '자유 탐색 안내 펼치기' : '자유 탐색 안내 접기'}>{collapsed ? '＋' : '−'}</button></div>
      {!collapsed && <><h2>잠깐 자유롭게 사용해 보세요.</h2><p>지도를 움직이거나, 필터를 바꾸거나, 공고 목록을 열어보세요. 데이터는 임시로 넣은 예시이며 실제 모집정보가 아닙니다.</p><p>충분히 둘러봤다면 아래 버튼으로 설문을 시작해 주세요.</p><button className="study-primary" onClick={()=>next('briefing')}>준비됐어요, 설문 시작하기</button></>}
    </aside>}
    {state.step === 'briefing' && <div className="study-modal-backdrop"><section className="study-intro" role="dialog" aria-modal="true" aria-labelledby="study-title">
      <span className="study-eyebrow">두 방법 비교·설문 · 약 4~6분</span>
      <h1 id="study-title">공고를 찾는 두 가지 방법,<br />직접 써 보고 알려 주세요.</h1>
      <p>공공주택에 관심 있는 분을 위한 기능 비교입니다. 서비스 소개를 마쳤으니, 이제 두 가지 방법을 체험하고 의견을 남겨 주세요. 각 방법은 시작 전에 설명해 드려요.</p>
      <p>아래 세 단계로 진행합니다.</p><ol><li>첫 번째 방법 체험</li><li>두 번째 방법 체험</li><li>비교·설문</li></ol>
      <p className="study-muted">단지·위치·모집조건은 체험용 예시입니다. 이름과 연락처는 묻지 않습니다. 설문을 제출하면 무작위 참여번호와 함께 체험 순서·완료 여부·평가·힌트 사용·소요 시간·이용 경로가 Tally에 저장됩니다. 제출 전 이탈 기록은 수집하지 않습니다.</p>
      {!import.meta.env.VITE_TALLY_FORM_ID && <p className="study-setup-notice">사전 점검 버전: 설문 연결 전이며 응답을 수집하지 않습니다.</p>}
      <button className="study-primary" autoFocus onClick={()=>next(`${state.order[0]}-task`)}>첫 번째 방법 알아보기 <span aria-hidden="true">→</span></button>
    </section></div>}
    {resume && <div className="study-modal-backdrop"><section className="study-intro" role="dialog" aria-modal="true" aria-label="체험 이어하기"><h1>진행 중이던 체험이 있어요</h1><p>같은 참여번호로 이어갑니다. 페이지를 떠나 있던 시간은 제외하고, 이 과제는 중단 후 재개한 기록으로 구분합니다.</p><button className="study-primary" autoFocus onClick={()=>{lastTick.current=performance.now();setResume(false)}}>이어서 체험하기</button></section></div>}
    {introduction && <StudyStepIntroduction key={introduction} step={introduction} order={state.order} onStart={()=>{lastTick.current=performance.now();dispatch({type:'begin-step'})}} />}
    {!['intro','warmup','explore','briefing','survey','complete'].includes(state.step) && !resume && !introduction && !ratingOpen && <aside className={`study-task-card ${collapsed ? 'is-collapsed' : ''}`} aria-label="체험 과제">
      <div className="study-task-heading"><span className="study-eyebrow">{ordinal} / 3 · {key ? METHOD_NAMES[key] : '비교·설문'}</span><button onClick={()=>setCollapsed(c=>!c)} aria-expanded={!collapsed} aria-label={collapsed ? '과제 펼치기' : '과제 접기'}>{collapsed ? '＋' : '−'}</button></div>
      {!collapsed && <>
        {trial && key ? <><h2>{trial.wrongRoute ? '공고 내용은 확인했어요.' : '공고중·접수중인 단지를 찾아 모집공고 내용을 열어 보세요.'}</h2>
          <p>{!ready ? '지도와 데이터를 준비하고 있습니다.' : trial.wrongRoute
            ? key === 'new' ? '이번에는 공고지도 핀을 통해 열어 보세요.' : '이번에는 모집상태 필터를 적용하고, 단지지도 핀에서 모집공고를 열어 보세요.'
            : `${METHOD_NAMES[key]} 방법을 직접 사용해 보세요. 막히면 힌트를 확인할 수 있어요.`}</p>
          <div className="study-actions"><button disabled={!hintAvailable} aria-expanded={hintOpen} aria-controls="study-current-hint" onClick={()=>{
            flush();if(!hintOpen) dispatch({type:'help',reason:'requested'});setHintOpen(open=>!open)
          }}>힌트 보기</button></div>
          {!hintAvailable && ready && <p className="study-muted">먼저 직접 찾아보세요. {Math.max(1,Math.ceil((HINT_DELAY_MS-trial.elapsedMs)/1000))}초 뒤 힌트를 볼 수 있어요.</p>}
          {hintOpen && <p id="study-current-hint" className="study-current-hint" role="note" aria-label="현재 상황 힌트">{studyHint(key,mode,hintContext)}</p>}
          {trial.helpAtMs !== null && <button className="study-text-button" onClick={()=>send({type:'skip'})}>계속하기 어렵다면, 이 방법 마치기</button>}
          {trial.errors > 0 && <p className="study-muted">연결 오류가 기록되었습니다. 지도 오류 안내의 다시 시도를 이용해 주세요.</p>}
        </> : <><h2>두 방법을 비교해 보세요.</h2><p>자유롭게 다시 둘러볼 수 있어요. 처음 체험한 기록과 직후 평가는 유지됩니다.</p>
          <div className="study-method-recap">{state.order.map(method=><div key={method}><strong>{METHOD_NAMES[method]}</strong><p>{method === 'old' ? '모집상태 → 단지 핀 → 모집공고' : '공고지도 → 공고 요약 핀 → 모집공고'}</p></div>)}</div>
          <button className="study-primary" onClick={()=>next('survey')}>설문 작성하기</button></>}
      </>}
    </aside>}
    {ratingOpen && key && <StudyRating method={key} ordinal={ordinal} skipped={trial.outcome === 'skipped'} onRate={rate} />}
    {touring && ready && <StudySpotlight key={`tour-${state.tourStep}`} tip={SERVICE_TOUR[state.tourStep]} index={state.tourStep} total={SERVICE_TOUR.length} label="서비스 소개"
      nextLabel={SERVICE_TOUR[state.tourStep].nextLabel}
      onPrevious={()=>showTourStep(state.tourStep-1)}
      onNext={()=>state.tourStep === SERVICE_TOUR.length-1 ? next('explore') : showTourStep(state.tourStep+1)} />}
    {touring && !ready && <aside className="study-task-card" role="status">지도와 화면을 준비하고 있습니다…</aside>}
    {state.step === 'survey' && <div className="study-modal-backdrop"><section className="study-survey" role="dialog" aria-modal="true" aria-label="체험 설문"><div className="study-survey-heading"><div><span className="study-eyebrow">3 / 3 · 비교·설문</span><h1>직접 써 보니 어땠나요?</h1></div><button onClick={()=>next('compare')}>지도로 돌아가기</button></div><TallySurvey summary={summary} onSubmitted={onSubmitted} /></section></div>}
    {state.step === 'complete' && <div className="study-modal-backdrop"><section className="study-intro" role="status"><span className="study-eyebrow">참여 완료</span><h1>의견을 남겨 주셔서 감사합니다.</h1><p>설문 제출을 확인했습니다. 여러분의 의견을 모아 공고를 더 쉽게 찾을 수 있는지 검토하겠습니다.</p><p className="study-muted">체험 화면은 예시 데이터이며 실제 신청에 사용할 수 없습니다.</p><button className="study-primary" onClick={()=>next('compare')}>지도 더 둘러보기</button></section></div>}
  </div>
}
