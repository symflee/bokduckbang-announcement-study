import { readFileSync } from 'node:fs'
import { useEffect } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as data from './data'
import { StudyApp } from './StudyApp'
import type { ExplorerStudy } from './explorerStudy'
import { initialState, readState, saveState, studyReducer, type ExperimentSummary, type MethodOrder } from './state'
vi.mock('../public-housing/PublicHousingExplorer',()=>({PublicHousingExplorer:({study}:{study:ExplorerStudy})=>{
  const {onEvent}=study
  useEffect(()=>{onEvent({type:'ready',ready:true})},[onEvent])
  function detail(source:'filtered_complex'|'announcement_pin'|'other') {
    const requestId=crypto.randomUUID()
    onEvent({type:'request-detail',requestId,id:'1',source,complexId:source==='other'?null:'10001',applicationStatuses:['APPLYING']})
    onEvent({type:'detail',requestId,id:'1',status:'APPLYING'})
  }
  return <div data-testid="explorer"><button id="study-complex-tab">단지지도</button>
    <div className="housing-search-overlay"><input type="search" aria-label="지역 검색" /></div>
    <button data-study-filter="all">전체 필터</button><button data-study-filter="applicationStatus">모집상태</button>
    <button id="announcement-list-trigger" onClick={()=>detail('other')}>공고 목록</button><button id="recent-list-trigger">최근 본 단지</button>
    <button aria-label="지도 확대">＋</button>{study.newModeAvailable && <button id="study-announcement-tab" onClick={()=>study.onModeChange('announcements')}>공고지도</button>}
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
function click(name:string|RegExp){fireEvent.click(screen.getByRole('button',{name}))}
function intro(name:RegExp){
  const dialog=screen.getByRole('dialog',{name})
  expect(within(dialog).getByRole('heading')).toHaveFocus()
  expect(within(dialog).getAllByRole('listitem')).toHaveLength(3)
  return dialog
}
describe('three-stage guided comparison',()=>{
  it.each<MethodOrder>([['old','new'],['new','old']])('runs both assigned methods with immediate ratings: %s then %s',async(first,second)=>{
    const order=[first,second] as MethodOrder
    saveState(initialState(dataset.datasetVersion,'ordered-session',false,order))
    await mount(); screen.getByRole('button',{name:/안내를 확인했고/});click(/안내를 확인했고/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    for(const name of ['단지지도','지역 검색','전체 필터','공고 목록','최근 본 단지','지도 확대']) {
      const target=name==='지역 검색'?screen.getByRole('searchbox',{name}):screen.getByRole('button',{name})
      expect(target).toHaveClass('study-spotlit')
      if(name!=='지도 확대')click('다음 버튼 보기')
    }
    click('첫 번째 방법으로 넘어가기');intro(/첫 번째 방법/)
    act(()=>vi.advanceTimersByTime(70_000))
    expect(readState(dataset.datasetVersion)?.trials[first].elapsedMs).toBe(0)
    click('첫 번째 방법 시작하기')
    act(()=>vi.advanceTimersByTime(10_125))
    expect(readState(dataset.datasetVersion)?.trials[first].elapsedMs).toBe(0)
    click(first==='old'?'모집상태':'공고지도')
    act(()=>vi.advanceTimersByTime(4000));click(first==='old'?'필터 단지의 공고 열기':'공고 핀 열기')
    expect(screen.getByRole('dialog',{name:'공고 내용을 확인했어요.'})).toBeInTheDocument()
    act(()=>vi.advanceTimersByTime(20_000));click('4 쉬웠다');intro(/두 번째 방법/)
    click('두 번째 방법 시작하기');click(second==='old'?'모집상태':'공고지도')
    act(()=>vi.advanceTimersByTime(3000));click(second==='old'?'필터 단지의 공고 열기':'공고 핀 열기');click('5 매우 쉬웠다')
    intro(/두 가지 방법/);click('두 방법 비교하기');click('설문 작성하기')
    const summary=JSON.parse(screen.getByRole('status',{name:'체험 기록'}).textContent!) as ExperimentSummary
    expect(summary.order).toEqual(order)
    expect(summary[first]).toMatchObject({outcome:'success',elapsedMs:4000,helpAtMs:null,ease:4})
    expect(summary[second]).toMatchObject({outcome:'success',elapsedMs:3000,helpAtMs:null,ease:5})
  })
  it('does not complete map trials through filters or lists, and does not auto-open help at 60 seconds',async()=>{
    saveState(studyReducer(initialState(dataset.datasetVersion,'wrong-route',false,['new','old']),{type:'step',step:'new-task'}))
    await mount();screen.getByRole('button',{name:'첫 번째 방법 시작하기'});click('첫 번째 방법 시작하기');click('공고지도')
    act(()=>vi.advanceTimersByTime(70_000))
    expect(screen.queryByRole('note',{name:'방법 안내'})).not.toBeInTheDocument()
    click('필터 단지의 공고 열기')
    expect(screen.getByText('이번에는 공고지도 핀을 통해 열어 보세요.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    click('공고 목록');expect(readState(dataset.datasetVersion)?.trials.new.outcome).toBe('active')
    click('공고 핀 열기');expect(screen.getByRole('dialog',{name:'공고 내용을 확인했어요.'})).toBeInTheDocument()
  })
  it('uses one help button, pauses guidance reading, and allows an uncertain rating after skipping',async()=>{
    saveState(studyReducer(initialState(dataset.datasetVersion,'help',false,['old','new']),{type:'step',step:'old-task'}))
    await mount();screen.getByRole('button',{name:'첫 번째 방법 시작하기'});click('첫 번째 방법 시작하기');click('모집상태')
    act(()=>vi.advanceTimersByTime(1000));click('방법 보기')
    expect(screen.getByRole('button',{name:'모집상태'})).toHaveClass('study-spotlit')
    act(()=>vi.advanceTimersByTime(60_000));click('방법 안내 닫기')
    expect(readState(dataset.datasetVersion)?.trials.old).toMatchObject({elapsedMs:1000,helpAtMs:1000})
    expect(screen.queryByRole('button',{name:'못 찾겠어요'})).not.toBeInTheDocument()
    click('계속하기 어렵다면, 이 방법 마치기');click('판단하기 어려워요');intro(/두 번째 방법/)
    expect(readState(dataset.datasetVersion)?.trials.old).toMatchObject({outcome:'skipped',ease:'unsure'})
  })
  it('excludes background time and fractional guidance intervals from active measurement',async()=>{
    saveState(studyReducer(initialState(dataset.datasetVersion,'background',false,['old','new']),{type:'step',step:'old-task'}))
    await mount();click('첫 번째 방법 시작하기')
    act(()=>vi.advanceTimersByTime(1125));click('시작 안내 닫기')
    act(()=>vi.advanceTimersByTime(1000));click('방법 보기')
    act(()=>vi.advanceTimersByTime(60625));click('방법 안내 닫기')
    const visibility=vi.spyOn(document,'visibilityState','get')
    act(()=>{visibility.mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'))})
    act(()=>vi.advanceTimersByTime(90_000))
    act(()=>{visibility.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'))})
    act(()=>vi.advanceTimersByTime(2000));click('필터 단지의 공고 열기')
    expect(readState(dataset.datasetVersion)?.trials.old).toMatchObject({outcome:'success',elapsedMs:3000,helpAtMs:1000})
  })
  it('restores the service tour outside the three trial stages',async()=>{
    saveState({...initialState(dataset.datasetVersion,'tour'),step:'warmup',tourStep:3})
    await mount();screen.getByRole('heading',{name:'공고 탭은 공고 목록이에요'})
    expect(screen.getByRole('button',{name:'공고 목록'})).toHaveFocus()
    expect(readState(dataset.datasetVersion)?.trials.old.interrupted).toBe(false)
  })
  it('restores pending immediate ratings without restarting the trial',async()=>{
    const state=initialState(dataset.datasetVersion,'rating',false,['new','old'])
    saveState({...state,step:'new-task',trials:{...state.trials,new:{...state.trials.new,outcome:'skipped'}}})
    await mount();screen.getByRole('button',{name:'판단하기 어려워요'});click('판단하기 어려워요');intro(/두 번째 방법/)
    expect(readState(dataset.datasetVersion)?.order).toEqual(['new','old'])
  })
})
