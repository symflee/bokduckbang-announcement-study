import { flushSync } from 'react-dom'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { PublicHousingExplorer } from '../public-housing/PublicHousingExplorer'
import { announcementsByComplex, createStudyRepositories, loadStudyDataset, type MapMode, type StudyDataset } from './data'
import type { ExplorerStudyEvent } from './explorerStudy'
import { activeTrial, initialState, makeSummary, readState, saveState, studyReducer, type StudyAction, type StudyStep } from './state'
import { TallySurvey } from './TallySurvey'
import { StudyMapBoundary } from './StudyMapBoundary'

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
  const stateRef = useRef(state)
  const readyRef = useRef(false)
  const pausedRef = useRef(resume)
  const lastTick = useRef(performance.now())
  stateRef.current = state
  pausedRef.current = resume
  const key = activeTrial(state)
  const trial = key ? state.trials[key] : null
  const isGuide = state.step === 'old-guide' || state.step === 'new-guide'
  const newAvailable = ['new-task','new-guide','compare','survey','complete'].includes(state.step)
  const showCoach = isGuide || (trial?.outcome === 'active' && trial.helpAtMs !== null)
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
    if (pausedRef.current) return
    if (event.type === 'path' || event.type === 'request-detail') send(event)
    if (event.type === 'detail') send({type:'success',id:event.id,status:event.status})
    if (event.type === 'retry') send(event)
    if (event.type === 'error') {send({type:'error'});if(event.surface !== 'detail') {readyRef.current=false;setReady(false)}}
  },[flush,send])
  function next(step:StudyStep) {
    flush()
    if (step === 'old-task' || step === 'new-task') {
      readyRef.current=false;setReady(false);setMode('complexes');flushSync(()=>navigate(SEOUL,{replace:true}));setMapKey(k=>k+1)
    }
    setCollapsed(false);setCoachStep(0);dispatch({type:'step',step})
  }
  const onSubmitted = useCallback((responseId:string)=>dispatch({type:'submitted',responseId}),[])
  const summary = useMemo(()=>makeSummary(state,dataset.asOf,window.matchMedia('(max-width: 767px)').matches),[state,dataset.asOf])
  const oldGuide = state.step.startsWith('old')
  const guidance = oldGuide ? [
    {target:'.housing-map-filter',text:'지도 위의 모집상태 필터를 열고, 공고중·접수중을 선택해 주세요. 선택한 조건은 바로 적용됩니다.'},
    {target:'.map-region',text:'지역의 숫자 핀을 눌러 확대하고, 관심 있는 단지 핀을 선택해 주세요.'},
    {target:'.housing-detail-layer',text:'단지 상세의 모집공고를 누르면 공고 내용을 볼 수 있습니다.'},
  ] : [
    {target:'#study-announcement-tab',text:'메뉴의 공고지도를 선택해 주세요. 단지지도와 공고지도를 오갈 수 있습니다.'},
    {target:'.map-region',text:'지역의 숫자 핀을 눌러 확대해 보세요. 공고지도에는 진행 중 공고가 있는 단지만 표시됩니다.'},
    {target:'.study-announcement-pin',text:'공급기관·공고명·모집상태·일정이 적힌 핀을 누르면 공고가 바로 열립니다. 여러 공고가 있으면 하나를 골라 주세요.'},
  ]
  const coachTarget = guidance[coachStep].target
  useEffect(()=>{
    if (!showCoach) return
    const target = document.querySelector(coachTarget)
    target?.classList.add('study-highlight')
    return ()=>target?.classList.remove('study-highlight')
  },[showCoach,coachTarget,mode])
  return <div className="app-shell study-shell">
    <div className="study-map" inert={['intro','survey','complete'].includes(state.step) || resume}>
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
      <p>공공주택에 관심 있는 분을 위한 기능 비교입니다. 지도를 잠깐 둘러본 뒤, 두 가지 방법으로 모집공고를 찾아봅니다.</p>
      <ol><li>지도에 익숙해지기</li><li>두 가지 방법으로 공고 찾기</li><li>느낀 점을 설문으로 남기기</li></ol>
      <p className="study-muted">단지·위치·모집조건은 체험용 예시입니다. 이름과 연락처는 묻지 않습니다. 설문을 제출하면 무작위 참여번호와 함께 성공 여부·도움 사용·소요 시간·이용 경로가 Tally에 저장됩니다. 제출 전 이탈 기록은 수집하지 않습니다.</p>
      {!import.meta.env.VITE_TALLY_FORM_ID && <p className="study-setup-notice">사전 점검 버전: 설문 연결 전이며 응답을 수집하지 않습니다.</p>}
      <button className="study-primary" autoFocus onClick={()=>{navigate(SEOUL,{replace:true});setMapKey(k=>k+1);next('warmup')}}>안내를 확인했고, 체험할게요 <span aria-hidden="true">→</span></button>
    </section></div>}
    {resume && <div className="study-modal-backdrop"><section className="study-intro" role="dialog" aria-modal="true" aria-label="체험 이어하기"><h1>진행 중이던 체험이 있어요</h1><p>같은 참여번호로 이어갑니다. 페이지를 떠나 있던 시간은 제외하고, 이 과제는 중단 후 재개한 기록으로 구분합니다.</p><button className="study-primary" autoFocus onClick={()=>{lastTick.current=performance.now();setResume(false)}}>이어서 체험하기</button></section></div>}
    {!['intro','survey','complete'].includes(state.step) && !resume && <aside className={`study-task-card ${collapsed ? 'is-collapsed' : ''}`} aria-label="체험 과제">
      <div className="study-task-heading"><span className="study-eyebrow">{state.step === 'warmup' ? '01 · 지도 둘러보기' : state.step.startsWith('old') ? '02 · 첫 번째 방법' : state.step.startsWith('new') ? '03 · 두 번째 방법' : '04 · 비교와 설문'}</span><button onClick={()=>setCollapsed(c=>!c)} aria-expanded={!collapsed} aria-label={collapsed ? '과제 펼치기' : '과제 접기'}>{collapsed ? '＋' : '−'}</button></div>
      {!collapsed && <>
        {state.step === 'warmup' ? <><h2>여기는 공공주택 단지 지도예요.</h2><p>지도를 움직이거나 확대하고, 단지를 하나 눌러 보세요. 지역 이름이나 단지 이름을 검색해도 됩니다.</p><button className="study-primary" disabled={!ready} onClick={()=>next('old-task')}>{ready ? '첫 번째 과제 시작' : '지도 준비 중…'}</button></>
          : trial ? <><h2>{trial.outcome === 'success' ? '공고 내용을 확인했어요.' : trial.outcome === 'skipped' ? '다음 단계에서 방법을 살펴볼게요.' : '공고가 올라온 단지를 찾고, 공고 내용을 확인해 주세요.'}</h2>
            {trial.outcome === 'active' ? <>
              <p>{!ready ? '지도와 데이터를 준비하는 동안 시간 측정은 멈춥니다.' : trial.helpAtMs === null ? '편한 방법으로 찾아보세요. 필요하면 언제든 도움을 받을 수 있어요.' : '아래 안내를 보면서 이어서 찾아보세요.'}</p>
              <div className="study-actions"><button onClick={()=>{setCoachStep(0);send({type:'help',reason:'requested'})}}>방법 보기</button><button onClick={()=>{setCoachStep(0);send({type:'help',reason:'give_up'})}}>못 찾겠어요</button></div>
              {trial.helpAtMs !== null && <button className="study-text-button" onClick={()=>send({type:'skip'})}>도움을 봐도 어렵다면, 다음으로</button>}
              {trial.errors > 0 && <p className="study-muted">연결 오류가 기록되었습니다. 지도 오류 안내의 다시 시도를 이용해 주세요.</p>}
            </> : <><p>{trial.outcome === 'success' ? '이제 이 방법의 사용 순서를 짧게 확인해 볼게요.' : '찾지 못한 경험도 중요한 의견입니다.'}</p><button className="study-primary" onClick={()=>next(key === 'old' ? 'old-guide' : 'new-guide')}>사용 방법 살펴보기</button></>}
          </> : isGuide ? <><h2>{oldGuide ? '필터로 진행 중인 공고 찾기' : '공고지도에서 바로 찾기'}</h2><p>아래 세 단계를 따라 직접 확인할 수 있어요.</p></> : <><h2>어떤 방법이 더 편했나요?</h2><p>단지지도와 공고지도를 다시 살펴보세요. 서울뿐 아니라 전국의 예시 단지도 탐색할 수 있습니다.</p><button className="study-primary" onClick={()=>next('survey')}>설문 작성하기</button></>}
        {showCoach && <div className="study-coach" role="note"><span>{coachStep+1} / 3</span><p>{guidance[coachStep].text}</p><div className="study-actions"><button disabled={coachStep === 0} onClick={()=>setCoachStep(i=>i-1)}>이전</button><button disabled={coachStep === 2} onClick={()=>setCoachStep(i=>i+1)}>다음 안내</button></div></div>}
        {isGuide && <button className="study-primary" onClick={()=>next(oldGuide ? 'new-task' : 'compare')}>{oldGuide ? '두 번째 과제 시작' : '비교하고 설문 작성'}</button>}
      </>}
    </aside>}
    {state.step === 'survey' && <div className="study-modal-backdrop"><section className="study-survey" role="dialog" aria-modal="true" aria-label="체험 설문"><div className="study-survey-heading"><div><span className="study-eyebrow">04 · 마지막으로 의견을 들려주세요</span><h1>직접 써 보니 어땠나요?</h1></div><button onClick={()=>next('compare')}>지도로 돌아가기</button></div><TallySurvey summary={summary} onSubmitted={onSubmitted} /></section></div>}
    {state.step === 'complete' && <div className="study-modal-backdrop"><section className="study-intro" role="status"><span className="study-eyebrow">참여 완료</span><h1>의견을 남겨 주셔서 감사합니다.</h1><p>설문 제출을 확인했습니다. 여러분의 의견을 모아 공고를 더 쉽게 찾을 수 있는지 검토하겠습니다.</p><p className="study-muted">체험 화면은 예시 데이터이며 실제 신청에 사용할 수 없습니다.</p><button className="study-primary" onClick={()=>next('compare')}>지도 더 둘러보기</button></section></div>}
  </div>
}
