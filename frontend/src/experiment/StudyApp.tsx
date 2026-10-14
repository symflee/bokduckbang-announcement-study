import { flushSync } from 'react-dom'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { PublicHousingExplorer } from '../public-housing/PublicHousingExplorer'
import { announcementsByComplex, createStudyRepositories, loadStudyDataset, type MapMode, type StudyDataset } from './data'
import type { ExplorerStudyEvent } from './explorerStudy'
import { activeTrial, hasStepIntroduction, initialState, makeSummary, readState, saveState, studyReducer, type StudyAction, type StudyStep } from './state'
import { TallySurvey } from './TallySurvey'
import { StudyMapBoundary } from './StudyMapBoundary'
import { StudyStepIntroduction } from './StudyStepIntroduction'
import { StudySpotlight, type StudyTip } from './StudySpotlight'

const SERVICE_TOUR: readonly StudyTip[] = [
  {target:'#study-complex-tab', title:'단지지도', text:'공공주택 단지가 어디에 있는지 볼 수 있어요. 지도를 움직이거나 단지를 눌러 위치와 기본 정보를 확인합니다.'},
  {target:'.housing-search-overlay input[type="search"]', title:'지역이나 단지를 검색해요', text:'지역, 지하철역, 단지 또는 공고 이름으로 검색할 수 있어요. 원하는 동네로 바로 이동할 때 사용합니다.'},
  {target:'[data-study-filter="all"]', title:'조건에 맞는 단지를 골라요', text:'전체 필터에서 지역, 임대유형, 모집상태, 가격, 면적 등의 조건을 고를 수 있어요. 옆의 개별 버튼으로 조건 하나만 바꿀 수도 있습니다.'},
  {target:'#announcement-list-trigger', title:'공고 탭은 공고 목록이에요', text:'공고 버튼을 누르면 모집공고를 목록으로 볼 수 있어요. 목록에서 공고를 선택하면 모집 조건과 일정을 확인할 수 있습니다.'},
  {target:'#recent-list-trigger', title:'최근 본 단지를 다시 찾아요', text:'앞서 열어 본 단지가 모여 있어요. 관심 있게 봤던 단지를 다시 확인할 때 사용합니다.'},
  {target:'button[aria-label="지도 확대"]', title:'확대해서 단지를 확인해요', text:'＋와 −로 지도를 확대하거나 축소할 수 있어요. 숫자 핀은 해당 지역의 단지 수예요. 확대하면 개별 단지를 볼 수 있습니다. 이제 소개를 마치고 첫 번째 방법을 체험할게요.'},
]

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
  const [coachStep,setCoachStep] = useState(0)
  const [coachDismissed,setCoachDismissed] = useState(false)
  const introduction = !state.stageStarted && hasStepIntroduction(state.step) ? state.step : null
  const stateRef = useRef(state)
  const readyRef = useRef(false)
  const pausedRef = useRef(resume)
  const lastTick = useRef(performance.now())
  stateRef.current = state
  pausedRef.current = resume || introduction !== null
  const key = activeTrial(state)
  const trial = key ? state.trials[key] : null
  const newAvailable = ['new-task','compare','survey','complete'].includes(state.step)
  const showCoach = !resume && !coachDismissed && trial?.outcome === 'active' && trial.helpAtMs !== null
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
    if (event.type === 'ready') {flush();readyRef.current=event.ready;setReady(event.ready);return}
    if (event.type === 'error' && event.surface !== 'detail') {flush();readyRef.current=false;setReady(false)}
    if (pausedRef.current) return
    if (event.type === 'path' || event.type === 'request-detail') send(event)
    if (event.type === 'detail') send({type:'success',id:event.id,status:event.status})
    if (event.type === 'retry') send(event)
    if (event.type === 'error') send({type:'error'})
  },[flush,send])
  function next(step:StudyStep) {
    flush()
    if (step === 'old-task' || step === 'new-task') {
      readyRef.current=false;setReady(false);setMode('complexes');flushSync(()=>navigate(SEOUL,{replace:true}));setMapKey(k=>k+1)
    }
    setCollapsed(false);setCoachStep(0);setCoachDismissed(false);dispatch({type:'step',step})
  }
  const onSubmitted = useCallback((responseId:string)=>dispatch({type:'submitted',responseId}),[])
  const summary = useMemo(()=>makeSummary(state,dataset.asOf,window.matchMedia('(max-width: 767px)').matches),[state,dataset.asOf])
  const guidance: readonly StudyTip[] = state.step === 'old-task' ? [
    {target:'[data-study-filter="applicationStatus"]',title:'모집상태 버튼을 눌러 주세요',text:'색칠된 모집상태 버튼에서 공고중·접수중을 선택해 주세요. 모바일에서는 선택 후 모집상태 적용을 눌러 주세요.'},
    {target:'.map-region',title:'공고가 있는 단지를 찾아요',text:'조건에 맞는 단지만 지도에 남아요. 숫자 핀을 눌러 확대하고, 관심 있는 단지를 선택해 주세요.'},
    {target:'.housing-detail-layer',title:'단지의 모집공고를 열어요',text:'단지 상세의 모집공고를 누르면 공고 내용을 확인할 수 있습니다.'},
  ] : [
    {target:'#study-announcement-tab',title:'공고지도 탭을 눌러 주세요',text:'공고지도는 진행 중인 공고가 있는 단지의 위치만 보여줘요. 공고 목록 버튼과는 다른 기능입니다.'},
    {target:'.map-region',title:'공고가 있는 지역을 확대해요',text:'숫자는 공고가 있는 단지 수예요. 대부분의 지역에는 공고가 없으며, 숫자 핀을 누르면 해당 지역을 확대합니다.'},
    {target:'.study-announcement-pin',title:'공고 요약 핀을 눌러 주세요',text:'기관·공고명·일정이 적힌 핀에서 공고 상세를 바로 열 수 있어요. 같은 단지에 여러 공고가 있으면 하나를 선택해 주세요.'},
  ]
  return <div className="app-shell study-shell">
    <div className="study-map" inert={['intro','survey','complete'].includes(state.step) || resume || introduction !== null}>
      <StudyMapBoundary key={mapKey} ready={ready} onFailure={()=>onEvent({type:'error',surface:'map'})} onRetry={()=>{flushSync(()=>send({type:'retry'}));saveState(stateRef.current);window.location.reload()}}>
      <PublicHousingExplorer {...repositories} showWelcome={false} streetViewSupported={false}
        study={{mode,newModeAvailable:newAvailable,announcements,onModeChange:setMode,onEvent}} />
      </StudyMapBoundary>
    </div>
    {mode === 'announcements' && <div className="study-mode-legend">숫자 = 공고가 있는 단지 수</div>}
    <div className="study-data-notice">체험용 예시 데이터 · 실제 모집정보가 아닙니다 · 기준일 {dataset.asOf}</div>
    {state.test && <span className="study-test-label">테스트 세션 · 분석 제외</span>}
    {state.step === 'intro' && <div className="study-modal-backdrop"><section className="study-intro" role="dialog" aria-modal="true" aria-labelledby="study-title">
      <img src="/logo-bok-search.svg" alt="복덕방" width="48" height="48" />
      <span className="study-eyebrow">공공주택 지도 체험 · 약 4~6분</span>
      <h1 id="study-title">공고를 찾는 두 가지 방법,<br />직접 써 보고 알려 주세요.</h1>
      <p>공공주택에 관심 있는 분을 위한 기능 비교입니다. 먼저 서비스를 간단히 소개하고 주요 버튼을 안내합니다. 소개가 끝나면 본격적으로 두 가지 방법을 체험합니다.</p>
      <ol><li>서비스와 주요 버튼 소개</li><li>두 가지 방법으로 공고 찾기</li><li>느낀 점을 설문으로 남기기</li></ol>
      <p className="study-muted">단지·위치·모집조건은 체험용 예시입니다. 이름과 연락처는 묻지 않습니다. 설문을 제출하면 무작위 참여번호와 함께 성공 여부·도움 사용·소요 시간·이용 경로가 Tally에 저장됩니다. 제출 전 이탈 기록은 수집하지 않습니다.</p>
      {!import.meta.env.VITE_TALLY_FORM_ID && <p className="study-setup-notice">사전 점검 버전: 설문 연결 전이며 응답을 수집하지 않습니다.</p>}
      <button className="study-primary" autoFocus onClick={()=>{navigate(SEOUL,{replace:true});setMapKey(k=>k+1);next('warmup')}}>안내를 확인했고, 시작할게요 <span aria-hidden="true">→</span></button>
    </section></div>}
    {resume && <div className="study-modal-backdrop"><section className="study-intro" role="dialog" aria-modal="true" aria-label="체험 이어하기"><h1>진행 중이던 체험이 있어요</h1><p>같은 참여번호로 이어갑니다. 페이지를 떠나 있던 시간은 제외하고, 이 과제는 중단 후 재개한 기록으로 구분합니다.</p><button className="study-primary" autoFocus onClick={()=>{lastTick.current=performance.now();setResume(false)}}>이어서 체험하기</button></section></div>}
    {introduction && <StudyStepIntroduction key={introduction} step={introduction} onStart={()=>{lastTick.current=performance.now();dispatch({type:'begin-step'})}} />}
    {!['intro','warmup','survey','complete'].includes(state.step) && !resume && !introduction && !showCoach && <aside className={`study-task-card ${collapsed ? 'is-collapsed' : ''}`} aria-label="체험 과제">
      <div className="study-task-heading"><span className="study-eyebrow">{state.step.startsWith('old') ? '02 · 첫 번째 방법' : state.step.startsWith('new') ? '03 · 두 번째 방법' : '04 · 비교와 설문'}</span><button onClick={()=>setCollapsed(c=>!c)} aria-expanded={!collapsed} aria-label={collapsed ? '과제 펼치기' : '과제 접기'}>{collapsed ? '＋' : '−'}</button></div>
      {!collapsed && <>
        {trial ? <><h2>{trial.outcome === 'success' ? '공고 내용을 확인했어요.' : trial.outcome === 'skipped' ? '이번 방법의 체험을 마쳤어요.' : '공고가 올라온 단지를 찾고, 공고 내용을 확인해 주세요.'}</h2>
            {trial.outcome === 'active' ? <>
              <p>{!ready ? '지도와 데이터를 준비하는 동안 시간 측정은 멈춥니다.' : trial.helpAtMs === null ? '편한 방법으로 찾아보세요. 필요하면 언제든 도움을 받을 수 있어요.' : '방법 보기를 눌러 안내를 다시 확인할 수 있어요.'}</p>
              <div className="study-actions"><button onClick={()=>{setCoachStep(0);setCoachDismissed(false);send({type:'help',reason:'requested'})}}>방법 보기</button></div>
              {trial.helpAtMs !== null && <button className="study-text-button" onClick={()=>send({type:'skip'})}>도움을 봐도 어렵다면, 다음으로</button>}
              {trial.errors > 0 && <p className="study-muted">연결 오류가 기록되었습니다. 지도 오류 안내의 다시 시도를 이용해 주세요.</p>}
            </> : <><p>{key === 'old' ? '첫 번째 방법의 체험이 끝났습니다. 이제 두 번째 방법으로 넘어갈게요.' : '두 가지 방법을 모두 체험했어요. 비교한 느낌을 알려 주세요.'}</p><button className="study-primary" onClick={()=>next(key === 'old' ? 'new-task' : 'compare')}>{key === 'old' ? '두 번째 방법으로 넘어가기' : '비교와 설문으로 넘어가기'}</button></>}
          </> : <><h2>어떤 방법이 더 편했나요?</h2><p>단지지도와 공고지도를 다시 살펴보세요. 서울뿐 아니라 전국의 예시 단지도 탐색할 수 있습니다.</p><button className="study-primary" onClick={()=>next('survey')}>설문 작성하기</button></>}
      </>}
    </aside>}
    {touring && ready && <StudySpotlight key={`tour-${state.tourStep}`} tip={SERVICE_TOUR[state.tourStep]} index={state.tourStep} total={SERVICE_TOUR.length} label="서비스 소개"
      nextLabel={state.tourStep === SERVICE_TOUR.length-1 ? '첫 번째 방법으로 넘어가기' : '다음 버튼 보기'}
      onPrevious={()=>dispatch({type:'tour-step',index:state.tourStep-1})}
      onNext={()=>state.tourStep === SERVICE_TOUR.length-1 ? next('old-task') : dispatch({type:'tour-step',index:state.tourStep+1})} />}
    {touring && !ready && <aside className="study-task-card" role="status">지도와 버튼을 준비하고 있습니다…</aside>}
    {showCoach && <StudySpotlight key={`help-${state.step}-${coachStep}`} tip={guidance[coachStep]} index={coachStep} total={guidance.length} label="방법 안내"
      nextLabel={coachStep === guidance.length-1 ? '직접 찾아보기' : '다음 안내'} onPrevious={()=>setCoachStep(i=>i-1)}
      onNext={()=>coachStep === guidance.length-1 ? setCoachDismissed(true) : setCoachStep(i=>i+1)} onClose={()=>setCoachDismissed(true)} onTargetActivate={()=>setCoachDismissed(true)} />}
    {state.step === 'survey' && <div className="study-modal-backdrop"><section className="study-survey" role="dialog" aria-modal="true" aria-label="체험 설문"><div className="study-survey-heading"><div><span className="study-eyebrow">04 · 마지막으로 의견을 들려주세요</span><h1>직접 써 보니 어땠나요?</h1></div><button onClick={()=>next('compare')}>지도로 돌아가기</button></div><TallySurvey summary={summary} onSubmitted={onSubmitted} /></section></div>}
    {state.step === 'complete' && <div className="study-modal-backdrop"><section className="study-intro" role="status"><span className="study-eyebrow">참여 완료</span><h1>의견을 남겨 주셔서 감사합니다.</h1><p>설문 제출을 확인했습니다. 여러분의 의견을 모아 공고를 더 쉽게 찾을 수 있는지 검토하겠습니다.</p><p className="study-muted">체험 화면은 예시 데이터이며 실제 신청에 사용할 수 없습니다.</p><button className="study-primary" onClick={()=>next('compare')}>지도 더 둘러보기</button></section></div>}
  </div>
}
