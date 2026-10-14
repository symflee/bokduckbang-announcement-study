import { readFileSync } from 'node:fs'
import { useEffect } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as data from './data'
import { StudyApp } from './StudyApp'
import type { ExplorerStudy } from './explorerStudy'
import { initialState, readState, saveState, studyReducer, type ExperimentSummary } from './state'

vi.mock('../public-housing/PublicHousingExplorer', () => ({
  PublicHousingExplorer: ({study}: {study: ExplorerStudy}) => {
    const {onEvent} = study
    useEffect(() => { onEvent({type:'ready', ready:true}) }, [onEvent])
    return <div data-testid="explorer">
      <button id="study-complex-tab">단지지도</button>
      <div className="housing-search-overlay"><input type="search" aria-label="지역 검색" /></div>
      <button data-study-filter="all">전체 필터</button>
      <button data-study-filter="applicationStatus">모집상태</button>
      <button id="announcement-list-trigger">공고 목록</button>
      <button id="recent-list-trigger">최근 본 단지</button>
      <button aria-label="지도 확대">＋</button>
      <button onClick={() => {
      study.onEvent({type:'request-detail', id:'1'})
      study.onEvent({type:'detail', id:'1', status:'APPLYING'})
    }}>진행 중 공고 열기</button></div>
  },
}))
vi.mock('./TallySurvey', () => ({
  TallySurvey: ({summary}: {summary: ExperimentSummary}) => <output aria-label="체험 기록">{JSON.stringify(summary)}</output>,
}))
const dataset = data.decodeStudyDataset(JSON.parse(readFileSync('public/study/national-500-v2.json', 'utf8')))

const originalScroll = HTMLElement.prototype.scrollIntoView
beforeEach(() => {
  sessionStorage.clear()
  HTMLElement.prototype.scrollIntoView=vi.fn()
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(120,48,100,40))
  vi.stubGlobal('ResizeObserver',class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(data, 'loadStudyDataset').mockResolvedValue(dataset)
  vi.stubGlobal('matchMedia', () => ({matches:false}))
})
afterEach(() => {
  HTMLElement.prototype.scrollIntoView=originalScroll
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})
function mount() { return render(<MemoryRouter><StudyApp /></MemoryRouter>) }
function click(name: string) { fireEvent.click(screen.getByRole('button', {name})) }
function expectIntroduction(name: RegExp) {
  const dialog = screen.getByRole('dialog', {name})
  expect(within(dialog).getByRole('heading')).toHaveFocus()
  expect(screen.getByTestId('explorer').closest('.study-map')).toHaveAttribute('inert')
  expect(screen.queryByRole('complementary', {name:'체험 과제'})).not.toBeInTheDocument()
  return dialog
}

describe('stage introductions', () => {
  it('uses one help button and highlights the recruitment-status control instead of the map', async () => {
    saveState({...initialState(dataset.datasetVersion,'help-session'),step:'old-task'})
    mount()
    await screen.findByRole('dialog',{name:'체험 이어하기'})
    click('이어서 체험하기')
    expect(screen.queryByRole('button',{name:'못 찾겠어요'})).not.toBeInTheDocument()
    click('방법 보기')
    const status=screen.getByRole('button',{name:'모집상태'})
    expect(status).toHaveClass('study-spotlit')
    expect(status).toHaveFocus()
    expect(screen.getByRole('note',{name:'방법 안내'})).toHaveTextContent('공고중·접수중')
    expect(readState(dataset.datasetVersion)?.trials.old.helpReason).toBe('requested')
    click('모집상태')
    expect(screen.queryByRole('note',{name:'방법 안내'})).not.toBeInTheDocument()
    expect(status).not.toHaveClass('study-spotlit')
    click('도움을 봐도 어렵다면, 다음으로')
    click('두 번째 방법으로 넘어가기')
    expectIntroduction(/두 번째 방법을\s+시작합니다/)
  })

  it('restores the service introduction position without marking a task interrupted',async()=>{
    saveState({...initialState(dataset.datasetVersion,'tour-session'),step:'warmup',tourStep:3})
    mount()
    await screen.findByRole('heading',{name:'공고 탭은 공고 목록이에요'})
    expect(screen.getByRole('button',{name:'공고 목록'})).toHaveFocus()
    expect(readState(dataset.datasetVersion)?.trials.old).toMatchObject({elapsedMs:0,interrupted:false})
    expect(readState(dataset.datasetVersion)?.tourStep).toBe(3)
  })

  it('announces every stage, separates both method starts, and excludes introduction time from survey measurements', async () => {
    mount()
    await screen.findByRole('button', {name:/안내를 확인했고/})
    fireEvent.click(screen.getByRole('button', {name:/안내를 확인했고/}))
    expectIntroduction(/먼저, 서비스를\s+짧게 소개할게요/)
    click('서비스 소개 시작')
    for (const name of ['단지지도','지역 검색','전체 필터','공고 목록','최근 본 단지','지도 확대']) {
      const target = name === '지역 검색' ? screen.getByRole('searchbox',{name}) : screen.getByRole('button',{name})
      expect(target).toHaveClass('study-spotlit')
      expect(target).toHaveFocus()
      expect(readState(dataset.datasetVersion)?.trials.old.elapsedMs).toBe(0)
      if (name !== '지도 확대') click('다음 버튼 보기')
    }
    click('첫 번째 방법으로 넘어가기')
    const first = expectIntroduction(/첫 번째 방법을\s+시작합니다/)
    expect(within(first).getByText('방법 1 / 2')).toBeInTheDocument()
    vi.useFakeTimers()
    act(() => vi.advanceTimersByTime(70_000))
    expect(readState(dataset.datasetVersion)?.trials.old).toMatchObject({elapsedMs:0, helpAtMs:null})
    fireEvent(first, new Event('cancel', {cancelable:true}))
    expect(first).toHaveAttribute('open')
    click('첫 번째 방법 시작하기')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('explorer').closest('.study-map')).not.toHaveAttribute('inert')
    act(() => vi.advanceTimersByTime(4000))
    click('진행 중 공고 열기')
    expect(screen.queryByRole('button',{name:'사용 방법 살펴보기'})).not.toBeInTheDocument()
    click('두 번째 방법으로 넘어가기')
    const second = expectIntroduction(/두 번째 방법을\s+시작합니다/)
    expect(within(second).getByText('방법 2 / 2')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(70_000))
    expect(readState(dataset.datasetVersion)?.trials.new).toMatchObject({elapsedMs:0, helpAtMs:null})
    click('두 번째 방법 시작하기')
    act(() => vi.advanceTimersByTime(3000))
    click('진행 중 공고 열기')
    expect(screen.queryByRole('button',{name:'사용 방법 살펴보기'})).not.toBeInTheDocument()
    click('비교와 설문으로 넘어가기')
    expectIntroduction(/두 가지 방법,\s+어떻게 달랐나요/)
    click('두 방법 다시 살펴보기')
    click('설문 작성하기')
    const summary = JSON.parse(screen.getByRole('status', {name:'체험 기록'}).textContent!) as ExperimentSummary
    expect(summary.old).toMatchObject({outcome:'success', elapsedMs:4000, helpAtMs:null})
    expect(summary.new).toMatchObject({outcome:'success', elapsedMs:3000, helpAtMs:null})
  })

  it('restores an unopened method introduction instead of treating it as an interrupted task', async () => {
    saveState(studyReducer(initialState(dataset.datasetVersion, 'same-session'), {type:'step', step:'new-task'}))
    mount()
    await screen.findByRole('dialog', {name:/두 번째 방법을\s+시작합니다/})
    expect(screen.queryByRole('dialog', {name:'체험 이어하기'})).not.toBeInTheDocument()
    expect(readState(dataset.datasetVersion)?.trials.new.interrupted).toBe(false)
    click('두 번째 방법 시작하기')
    expect(screen.getByRole('complementary', {name:'체험 과제'})).toBeInTheDocument()
  })
})
