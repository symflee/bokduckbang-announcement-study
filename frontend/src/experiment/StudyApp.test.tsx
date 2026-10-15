import { readFileSync } from 'node:fs'
import { StrictMode, useEffect } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as data from './data'
import { StudyApp } from './StudyApp'
import type { ExplorerStudy } from './explorerStudy'
import { EMPTY_HINT_CONTEXT } from './studyHints'
import { SERVICE_TOUR } from './serviceTour'
import { CONSENT_VERSION, initialState, readState, saveState, studyReducer, METHOD_NAMES, type ExperimentSummary } from './state'
vi.mock('../public-housing/PublicHousingExplorer',()=>({PublicHousingExplorer:({study}:{study:ExplorerStudy})=>{
  const {onEvent}=study
  const location=useLocation()
  const navigate=useNavigate()
  useEffect(()=>{onEvent({type:'ready',ready:true})},[onEvent])
  function detail(source:'filtered_complex'|'announcement_pin'|'other') {
    const requestId=crypto.randomUUID()
    onEvent({type:'request-detail',requestId,id:'1',source,complexId:source==='other'?null:'10001',applicationStatuses:['APPLYING']})
    navigate('/?announcementId=1&mapZoom=13')
    onEvent({type:'context',context:{...EMPTY_HINT_CONTEXT,detail:'announcement'}})
    onEvent({type:'detail',requestId,id:'1',status:'APPLYING'})
  }
  return <div data-testid="explorer"><output aria-label="지도 조건">{location.search}</output>
    {study.tourStep!==undefined && SERVICE_TOUR[study.tourStep].view==='list' && <section id="housing-list-page" aria-label="공고 목록 시연">실제 공고 목록</section>}
    <button onClick={()=>onEvent({type:'context',context:{...EMPTY_HINT_CONTEXT,detail:'complex-empty'}})}>공고 없는 단지 열기</button>
    <button onClick={()=>onEvent({type:'context',context:{...EMPTY_HINT_CONTEXT,statusFiltered:true,mapView:'individual',detail:'complex-active',complexFromFilteredPin:true}})}>공고 있는 단지 열기</button><button id="study-complex-tab">단지지도</button>
    <div className="housing-search-overlay"><input type="search" aria-label="지역 검색" /></div>
    <button data-study-filter="agency">공급기관</button><button data-study-filter="all">전체 필터</button><button data-study-filter="applicationStatus">모집상태</button>
    {study.tourStep!==undefined && SERVICE_TOUR[study.tourStep].filterPreview==='applicationStatus' && <section data-study-filter-panel="applicationStatus" aria-label="모집상태 필터 시연"><span>공고중·접수중</span><div data-study-filter-guide-host /></section>}
    <button id="announcement-list-trigger" onClick={()=>{
      onEvent({type:'control',control:'announcement_list_toggle'})
      if(study.tourStep===undefined) detail('other')
      else setTimeout(()=>onEvent({type:'context',context:{...EMPTY_HINT_CONTEXT,listOpen:true}}),0)
    }}>공고 목록</button><button id="recent-list-trigger" onClick={()=>{
      onEvent({type:'control',control:'recent_list_toggle'})
      onEvent({type:'context',context:{...EMPTY_HINT_CONTEXT,listOpen:true}})
    }}>최근 본 단지</button>
    <button onClick={()=>navigate('/?complexId=10004')}>다른 단지 상세 열기</button>
    <button onClick={()=>navigate('/?announcementId=20003')}>연결된 공고 상세 열기</button>
    <button onClick={()=>navigate('/')}>상세 닫기</button>
    <button aria-label="지도 확대">＋</button>{study.newModeAvailable && <button id="study-announcement-tab" className={study.guideAnnouncementTab?'is-study-guided':''} onClick={()=>study.onModeChange('announcements')}>공고지도</button>}
    <button onClick={()=>detail('filtered_complex')}>필터 단지의 공고 열기</button><button onClick={()=>detail('announcement_pin')}>공고 핀 열기</button></div>
}}))
vi.mock('./TallySurvey',()=>({TallySurvey:({summary}:{summary:ExperimentSummary})=><output aria-label="체험 기록">{JSON.stringify(summary)}</output>}))
const dataset=data.decodeStudyDataset(JSON.parse(readFileSync('public/study/national-500-v2.json','utf8')))
const originalScroll=HTMLElement.prototype.scrollIntoView
beforeEach(()=>{
  vi.useFakeTimers(); sessionStorage.clear(); HTMLElement.prototype.scrollIntoView=vi.fn()
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(120,48,100,40))
  vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}})
  vi.spyOn(data,'loadStudyDataset').mockResolvedValue(dataset)
  vi.stubGlobal('matchMedia',()=>({matches:false}))
})
afterEach(()=>{HTMLElement.prototype.scrollIntoView=originalScroll;vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();sessionStorage.clear()})
async function mount(){await act(async()=>{render(<MemoryRouter><StudyApp /></MemoryRouter>)})}
function consented(sessionId:string){return studyReducer(initialState(dataset.datasetVersion,sessionId),{type:'accept-consent',acceptedAt:'2026-10-15T00:00:00.000Z'})}
function click(name:string|RegExp){fireEvent.click(screen.getByRole('button',{name}))}
function intro(name:string|RegExp){
  const dialog=screen.getByRole('dialog',{name})
  expect(within(dialog).getByRole('heading')).toHaveFocus()
  expect(within(dialog).getAllByRole('listitem')).toHaveLength(3)
  return dialog
}
describe('three-stage guided comparison',()=>{
  it('keeps the study unstarted after declining and accepts consent only after returning to the notice',async()=>{
    await mount()
    const welcome=screen.getByRole('dialog',{name:/설문을 시작하기 전에/})
    expect(within(welcome).getByRole('heading')).toHaveFocus()
    expect(welcome).toHaveTextContent('설문을 제출하지 않고 나간 경우에도 동의 후 체험 기록은 남습니다')
    expect(welcome).toHaveTextContent('사용자를 식별할 수 없도록 처리한 실험 기록은 제품 개선과 실험 결과 정리를 위해 보관')
    expect(readState(dataset.datasetVersion)).toMatchObject({step:'intro',consent:null})
    click('참여하지 않기')
    const declined=screen.getByRole('dialog',{name:'참여하지 않으셔도 괜찮아요.'})
    expect(declined).toHaveTextContent('체험 기록과 화면 녹화를 시작하지 않았습니다')
    expect(readState(dataset.datasetVersion)).toMatchObject({step:'intro',consent:null})
    act(()=>vi.advanceTimersByTime(60000))
    click('안내로 돌아가기');click('동의하고 시작할게요')
    expect(readState(dataset.datasetVersion)).toMatchObject({step:'warmup',consent:{version:CONSENT_VERSION},trials:{old:{elapsedMs:0},new:{elapsedMs:0}}})
    expect(readState(dataset.datasetVersion)?.consent?.acceptedAt).toBe(new Date().toISOString())
  })
  it('lets participants close the centered start prompt, explore and open it again',async()=>{
    saveState({...consented('explore-prompt'),step:'explore'})
    await mount()
    const map=screen.getByTestId('explorer').closest('.study-map')
    let prompt=screen.getByRole('dialog',{name:'이제 두 방법을 체험해 볼까요?'})
    expect(within(prompt).getByRole('heading')).toHaveFocus()
    expect(map).toHaveAttribute('inert')
    click('조금 더 둘러보기')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(map).not.toHaveAttribute('inert')
    act(()=>vi.advanceTimersByTime(20))
    expect(screen.getByRole('button',{name:'설문 시작하기'})).toHaveFocus()
    click('설문 시작하기')
    prompt=screen.getByRole('dialog',{name:'이제 두 방법을 체험해 볼까요?'})
    fireEvent(prompt,new Event('cancel',{bubbles:true,cancelable:true}))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    click('설문 시작하기');click('준비됐어요, 설문 시작하기')
    expect(screen.getByRole('dialog',{name:/공고를 찾는 두 가지 방법/})).toBeInTheDocument()
    expect(readState(dataset.datasetVersion)?.trials.old.elapsedMs).toBe(0)
  })
  it('keeps the same map mounted from welcome through next, previous, and exploration',async()=>{
    await mount()
    const explorer=screen.getByTestId('explorer')
    click('동의하고 시작할게요')
    expect(screen.getByTestId('explorer')).toBe(explorer)
    for(const [index,tip] of SERVICE_TOUR.entries()) {
      expect(screen.getByRole('heading',{name:tip.title})).toBeInTheDocument()
      if(index>0) {
        click('이전')
        expect(screen.getByTestId('explorer')).toBe(explorer)
        click(SERVICE_TOUR[index-1].nextLabel)
      }
      click(tip.nextLabel)
      expect(screen.getByTestId('explorer')).toBe(explorer)
      expect(screen.queryByText('지도와 화면을 준비하고 있습니다…')).not.toBeInTheDocument()
    }
    expect(screen.getByRole('heading',{name:'이제 두 방법을 체험해 볼까요?'})).toBeInTheDocument()
    // A leftover mobile detail would become modal again and trap exploration behind it.
    expect(screen.getByRole('status',{name:'지도 조건',hidden:true})).not.toHaveTextContent('announcementId')
    expect(screen.getByRole('status',{name:'지도 조건',hidden:true})).not.toHaveTextContent('complexId')
    click('준비됐어요, 설문 시작하기')
    expect(screen.getByTestId('explorer')).toBe(explorer)
  })
  it('runs filters first, then the announcement map with immediate ratings',async()=>{
    const first='old',second='new',order=['old','new'] as const
    saveState(initialState(dataset.datasetVersion,'ordered-session'))
    await mount();screen.getByRole('heading',{name:/설문을 시작하기 전에/});click('동의하고 시작할게요')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    for(const tip of SERVICE_TOUR) {
      expect(screen.getByRole('heading',{name:tip.title})).toBeInTheDocument()
      if(tip.filterPreview==='applicationStatus') {
        expect(screen.getByRole('status',{name:'지도 조건',hidden:true})).not.toHaveTextContent('complexApplicationStatuses')
        expect(screen.getByRole('region',{name:'모집상태 필터 시연'})).toHaveClass('study-spotlit')
      }
      if(tip.view==='list') expect(screen.getByRole('region',{name:'공고 목록 시연'})).toBeInTheDocument()
      const route=screen.getByRole('status',{name:'지도 조건'}).textContent
      if(tip.view==='complex' || tip.view==='complex-announcement') expect(route).toContain('complexId=10001')
      if(tip.view==='announcement' || tip.view==='list-announcement') expect(route).toContain('announcementId=20001')
      if(tip.pinLegend) {
        const legend=screen.getByRole('dialog',{name:tip.title})
        const labels=within(legend).getAllByRole('listitem').map(item=>item.querySelector('strong')?.textContent)
        expect(labels).toEqual(['공고없음','공고중','접수중'])
        expect(legend).not.toHaveTextContent('선택한 단지')
        expect(within(legend).getByRole('heading')).toHaveFocus()
      }
      click(tip.nextLabel)
    }
    expect(screen.getByRole('heading',{name:'이제 두 방법을 체험해 볼까요?'})).toBeInTheDocument()
    click('조금 더 둘러보기')
    act(()=>vi.advanceTimersByTime(70_000));click('공고 핀 열기')
    expect(readState(dataset.datasetVersion)?.trials[first]).toMatchObject({outcome:'active',elapsedMs:0})
    click('설문 시작하기');click('준비됐어요, 설문 시작하기')
    const briefing=screen.getByRole('dialog',{name:/공고를 찾는 두 가지 방법/})
    expect(briefing).toHaveTextContent('공공주택 단지가 어디에 있는지')
    expect(briefing).toHaveTextContent('현재 모집공고가 열려 있는 단지')
    expect(within(briefing).queryByRole('list')).not.toBeInTheDocument()
    click('첫 번째 방법 알아보기');intro(METHOD_NAMES[first])
    act(()=>vi.advanceTimersByTime(70_000))
    expect(readState(dataset.datasetVersion)?.trials[first].elapsedMs).toBe(0)
    click('첫 번째 방법 시작하기')
    expect(screen.queryByRole('note',{name:'시작 안내'})).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'힌트 보기'})).toBeDisabled()
    act(()=>vi.advanceTimersByTime(4000));click(first==='old'?'필터 단지의 공고 열기':'공고 핀 열기')
    expect(screen.getByRole('dialog',{name:'공고 내용을 확인했어요.'})).toBeInTheDocument()
    act(()=>vi.advanceTimersByTime(20_000));click('4 쉬웠다');intro(METHOD_NAMES[second])
    click('두 번째 방법 시작하기');click('공고지도')
    act(()=>vi.advanceTimersByTime(3000));click('공고 핀 열기');click('5 매우 쉬웠다')
    expect(screen.getByRole('dialog',{name:'체험 설문'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'설문 작성하기'})).not.toBeInTheDocument()
    expect(screen.getByRole('status',{name:'지도 조건',hidden:true})).not.toHaveTextContent('announcementId')
    expect(screen.getByRole('status',{name:'지도 조건',hidden:true})).toHaveTextContent('mapZoom=13')
    const summary=JSON.parse(screen.getByRole('status',{name:'체험 기록'}).textContent!) as ExperimentSummary
    expect(summary.order).toEqual(order)
    expect(summary[first]).toMatchObject({outcome:'success',elapsedMs:4000,helpAtMs:null,ease:4})
    expect(summary[second]).toMatchObject({outcome:'success',elapsedMs:3000,helpAtMs:null,ease:5})
  })
  it('waits for the list to open before moving its introduction forward',async()=>{
    const tabStep=SERVICE_TOUR.findIndex(tip=>tip.target==='#announcement-list-trigger')
    saveState({...consented('tour-list'),step:'warmup',tourStep:tabStep})
    await mount()
    click('공고 목록')
    expect(screen.getByRole('heading',{name:SERVICE_TOUR[tabStep].title})).toBeInTheDocument()
    act(()=>vi.advanceTimersByTime(1))
    expect(screen.getByRole('heading',{name:SERVICE_TOUR[tabStep+1].title})).toBeInTheDocument()
  })
  it('does not advance the announcement-list introduction when a different list opens',async()=>{
    saveState({...consented('tour-other-list'),tourStep:7})
    await mount()
    click('최근 본 단지')
    expect(screen.getByRole('heading',{name:SERVICE_TOUR[7].title})).toBeInTheDocument()
    click('공고 목록')
    act(()=>vi.advanceTimersByTime(1))
    expect(screen.getByRole('heading',{name:SERVICE_TOUR[8].title})).toBeInTheDocument()
  })
  it.each([[4,3],[5,3],[6,5],[9,8]])('keeps the guide connected after closing the detail in step %i',async(from,to)=>{
    saveState({...consented('tour-close'),tourStep:from})
    await mount()
    click('상세 닫기')
    expect(screen.getByRole('heading',{name:SERVICE_TOUR[to].title})).toBeInTheDocument()
  })
  it('keeps the selected complex when returning from its announcement and follows detail links',async()=>{
    saveState({...consented('tour-selection'),tourStep:4})
    await mount()
    click('다른 단지 상세 열기')
    click('모집공고 살펴보기')
    click('공고 상세 열어보기')
    click('이전')
    expect(screen.getByRole('status',{name:'지도 조건'})).toHaveTextContent('complexId=10004')
    click('연결된 공고 상세 열기')
    expect(screen.getByRole('heading',{name:SERVICE_TOUR[6].title})).toBeInTheDocument()
    click('다른 단지 상세 열기')
    expect(screen.getByRole('heading',{name:SERVICE_TOUR[4].title})).toBeInTheDocument()
  })
  it.each([4,5,6,9])('restores step %i on reload under StrictMode without treating initial navigation as a close',async index=>{
    saveState({...consented('tour-reload'),tourStep:index})
    await act(async()=>{render(<StrictMode><MemoryRouter><StudyApp /></MemoryRouter></StrictMode>)})
    expect(screen.getByRole('heading',{name:SERVICE_TOUR[index].title})).toBeInTheDocument()
    expect(readState(dataset.datasetVersion)?.tourStep).toBe(index)
  })
  it('advances after a detail opens and ignores unchanged context when returning to its introduction',async()=>{
    const pinStep=SERVICE_TOUR.findIndex(tip=>tip.view==='pins' && tip.advanceOnTarget)
    saveState({...consented('tour-context'),step:'warmup',tourStep:pinStep})
    await mount()
    click('공고 있는 단지 열기')
    expect(screen.getByRole('heading',{name:SERVICE_TOUR[pinStep+1].title})).toBeInTheDocument()
    click('이전')
    click('공고 있는 단지 열기')
    expect(screen.getByRole('heading',{name:SERVICE_TOUR[pinStep].title})).toBeInTheDocument()
  })
  it('does not complete map trials through filters or lists, and does not auto-open help at 60 seconds',async()=>{
    saveState(studyReducer(consented('wrong-route'),{type:'step',step:'new-task'}))
    await mount();screen.getByRole('button',{name:'두 번째 방법 시작하기'});click('두 번째 방법 시작하기');click('공고지도')
    act(()=>vi.advanceTimersByTime(70_000))
    expect(screen.queryByRole('note',{name:'현재 상황 힌트'})).not.toBeInTheDocument()
    click('필터 단지의 공고 열기')
    expect(screen.getByText('이번에는 공고지도에서 핀을 통해 공고를 찾아 보세요.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'공고지도'})).toHaveClass('is-study-guided')
    click('공고 목록');expect(readState(dataset.datasetVersion)?.trials.new.outcome).toBe('active')
    click('공고 핀 열기');expect(screen.getByRole('dialog',{name:'공고 내용을 확인했어요.'})).toBeInTheDocument()
  })
  it('enables one hint button without countdown or skip and continues through completion',async()=>{
    saveState(studyReducer(consented('help'),{type:'step',step:'old-task'}))
    await mount();screen.getByRole('button',{name:'첫 번째 방법 시작하기'});click('첫 번째 방법 시작하기');click('모집상태')
    act(()=>vi.advanceTimersByTime(14_750))
    expect(screen.getByRole('button',{name:'힌트 보기'})).toBeDisabled()
    expect(screen.queryByText(/초 뒤 힌트/)).not.toBeInTheDocument()
    act(()=>vi.advanceTimersByTime(250))
    expect(screen.getByRole('button',{name:'힌트 보기'})).toBeEnabled()
    click('힌트 보기')
    expect(screen.getByRole('note',{name:'현재 상황 힌트'})).toHaveTextContent('모집상태를 공고중·접수중으로 좁혀')
    expect(screen.getByRole('button',{name:'모집상태'})).not.toHaveClass('study-spotlit')
    act(()=>vi.advanceTimersByTime(60_000));click('힌트 보기')
    expect(readState(dataset.datasetVersion)?.trials.old).toMatchObject({elapsedMs:15000,helpAtMs:15000})
    expect(readState(dataset.datasetVersion)?.trials.old.hintOpens).toHaveLength(1)
    expect(screen.queryByRole('button',{name:'못 찾겠어요'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:/이 방법 마치기/})).not.toBeInTheDocument()
    click('필터 단지의 공고 열기');click('판단하기 어려워요');intro('공고지도로 찾기')
    expect(readState(dataset.datasetVersion)?.trials.old).toMatchObject({outcome:'success',ease:'unsure'})
  })
  it('excludes background time and fractional guidance intervals from active measurement',async()=>{
    saveState(studyReducer(consented('background'),{type:'step',step:'old-task'}))
    await mount();click('첫 번째 방법 시작하기')
    act(()=>vi.advanceTimersByTime(15_125));click('힌트 보기')
    act(()=>vi.advanceTimersByTime(60625));click('힌트 보기')
    const visibility=vi.spyOn(document,'visibilityState','get')
    act(()=>{visibility.mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'))})
    act(()=>vi.advanceTimersByTime(90_000))
    act(()=>{visibility.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'))})
    act(()=>vi.advanceTimersByTime(2000));click('필터 단지의 공고 열기')
    expect(readState(dataset.datasetVersion)?.trials.old).toMatchObject({outcome:'success',elapsedMs:17125,helpAtMs:15125})
  })
  it('restores the service tour outside the three trial stages',async()=>{
    saveState({...consented('tour'),step:'warmup',tourStep:SERVICE_TOUR.findIndex(tip=>tip.view==='list')})
    await mount();screen.getByRole('heading',{name:'목록에서 공고를 골라요'})
    expect(screen.getByRole('region',{name:'공고 목록 시연'})).toHaveClass('study-spotlit')
    expect(readState(dataset.datasetVersion)?.trials.old.interrupted).toBe(false)
  })
  it.each(['complex','announcement','list-announcement'] as const)('restores the actual %s preview without counting a trial',async view=>{
    saveState({...consented('tour-detail'),step:'warmup',tourStep:SERVICE_TOUR.findIndex(tip=>tip.view===view)})
    await mount()
    expect(screen.getByRole('status',{name:'지도 조건'})).toHaveTextContent(view==='complex'?'complexId=10001':'announcementId=20001')
    expect(readState(dataset.datasetVersion)?.trials.old.elapsedMs).toBe(0)
    click('이전')
    expect(readState(dataset.datasetVersion)?.tourStep).toBe(SERVICE_TOUR.findIndex(tip=>tip.view===view)-1)
  })
  it('offers only a relevant hint and dismisses it when the map situation changes',async()=>{
    saveState(studyReducer(consented('context'),{type:'step',step:'old-task'}))
    await mount();click('첫 번째 방법 시작하기');act(()=>vi.advanceTimersByTime(15000))
    click('힌트 보기');click('공고 없는 단지 열기')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    click('힌트 보기')
    expect(screen.getByRole('note')).toHaveTextContent('이 단지에는 진행 중인 공고가 없어요')
    expect(screen.getByRole('note')).not.toHaveTextContent('단지 상세의 모집공고')
    click('공고 있는 단지 열기');click('힌트 보기')
    expect(screen.getByRole('note')).toHaveTextContent('단지 상세의 모집공고')
    expect(screen.getAllByRole('button',{name:'힌트 보기'})).toHaveLength(1)
    expect(screen.queryByRole('button',{name:'직접 찾아보기'})).not.toBeInTheDocument()
    const trial=readState(dataset.datasetVersion)?.trials.old
    expect(trial?.hintOpens.map(hint=>hint.hintCode)).toEqual(['apply_status_filter','choose_another_complex','open_complex_announcement'])
    expect(trial?.hintOpens.map(hint=>hint.activeElapsedMs)).toEqual([15000,15000,15000])
    expect(trial?.helpAtMs).toBe(15000)
    expect(trial?.hintOpens[2]).toMatchObject({mode:'complexes',context:{statusFiltered:true,detail:'complex-active',complexFromFilteredPin:true,mapView:'individual'}})
    click('힌트 보기')
    expect(readState(dataset.datasetVersion)?.trials.old.hintOpens).toHaveLength(3)
    expect(readState(dataset.datasetVersion)?.trials.new.hintOpens).toHaveLength(0)
  })
  it('resumes the timer when map interaction dismisses an open hint',async()=>{
    saveState(studyReducer(consented('interaction'),{type:'step',step:'old-task'}))
    await mount();click('첫 번째 방법 시작하기');act(()=>vi.advanceTimersByTime(15000));click('힌트 보기')
    act(()=>vi.advanceTimersByTime(5125));fireEvent.pointerDown(screen.getByTestId('explorer'))
    expect(screen.queryByRole('note',{name:'현재 상황 힌트'})).not.toBeInTheDocument()
    act(()=>vi.advanceTimersByTime(2000));click('필터 단지의 공고 열기')
    expect(readState(dataset.datasetVersion)?.trials.old).toMatchObject({elapsedMs:17000,helpAtMs:15000})
  })
  it.each(['explore','briefing'] as const)('restores %s without starting or timing a method',async step=>{
    saveState({...consented('before-study'),step})
    await mount();act(()=>vi.advanceTimersByTime(60000))
    expect(readState(dataset.datasetVersion)?.step).toBe(step)
    expect(readState(dataset.datasetVersion)?.trials.old.elapsedMs).toBe(0)
  })
  it('restores pending immediate ratings without restarting the trial',async()=>{
    const state=consented('rating')
    saveState({...state,step:'old-task',trials:{...state.trials,old:{...state.trials.old,outcome:'skipped'}}})
    await mount();screen.getByRole('button',{name:'판단하기 어려워요'});click('판단하기 어려워요');intro(/필터로 찾기|공고지도로 찾기/)
    expect(readState(dataset.datasetVersion)?.order).toEqual(['old','new'])
  })
})
