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
    return <div data-testid="explorer"><button onClick={() => {
      study.onEvent({type:'request-detail', id:'1'})
      study.onEvent({type:'detail', id:'1', status:'APPLYING'})
    }}>진행 중 공고 열기</button></div>
  },
}))
vi.mock('./TallySurvey', () => ({
  TallySurvey: ({summary}: {summary: ExperimentSummary}) => <output aria-label="체험 기록">{JSON.stringify(summary)}</output>,
}))
const dataset = data.decodeStudyDataset(JSON.parse(readFileSync('public/study/national-500-v1.json', 'utf8')))

beforeEach(() => {
  sessionStorage.clear()
  vi.spyOn(data, 'loadStudyDataset').mockResolvedValue(dataset)
  vi.stubGlobal('matchMedia', () => ({matches:false}))
})
afterEach(() => {
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
  it('announces every stage, separates both method starts, and excludes introduction time from survey measurements', async () => {
    mount()
    await screen.findByRole('button', {name:/안내를 확인했고/})
    fireEvent.click(screen.getByRole('button', {name:/안내를 확인했고/}))
    expectIntroduction(/먼저, 지도를\s+둘러볼게요/)
    click('지도 둘러보기 시작')
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
    click('사용 방법 살펴보기')
    expectIntroduction(/첫 번째 방법을\s+함께 살펴볼게요/)
    click('첫 번째 방법 안내 보기')
    click('두 번째 방법으로 넘어가기')
    const second = expectIntroduction(/두 번째 방법을\s+시작합니다/)
    expect(within(second).getByText('방법 2 / 2')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(70_000))
    expect(readState(dataset.datasetVersion)?.trials.new).toMatchObject({elapsedMs:0, helpAtMs:null})
    click('두 번째 방법 시작하기')
    act(() => vi.advanceTimersByTime(3000))
    click('진행 중 공고 열기')
    click('사용 방법 살펴보기')
    expectIntroduction(/두 번째 방법을\s+함께 살펴볼게요/)
    click('두 번째 방법 안내 보기')
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
