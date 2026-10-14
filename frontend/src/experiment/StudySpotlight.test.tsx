import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudySpotlight } from './StudySpotlight'

beforeEach(()=>{
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}})
})
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('소개 강조 위치',()=>{
  it('패널 전환이 끝난 실제 위치로 강조 영역을 갱신한다',()=>{
    let bounds=new DOMRect(-340,80,400,600)
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.id==='tour-panel'?bounds:new DOMRect()})
    const {container}=render(<><aside id="tour-panel">공고 목록</aside><StudySpotlight tip={{target:'#tour-panel',title:'목록 소개',text:'공고 목록입니다'}} index={0} total={1} label="소개" nextLabel="다음" onPrevious={()=>{}} onNext={()=>{}} /></>)
    const frame=()=>container.querySelector('.study-spotlight-frame') as HTMLElement
    expect(frame().style.left).toBe('4px')
    bounds=new DOMRect(60,80,400,600)
    fireEvent.transitionEnd(container.querySelector('#tour-panel')!)
    act(()=>vi.advanceTimersByTime(20))
    expect(frame().style.left).toBe('60px')
    expect(frame().style.width).toBe('400px')
  })
  it('화면 밖으로 나간 부분은 강조 영역에서 제외한다',()=>{
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(60,600,400,500))
    const {container}=render(<><aside id="tour-panel"/><StudySpotlight tip={{target:'#tour-panel',title:'목록 소개',text:'공고 목록입니다'}} index={0} total={1} label="소개" nextLabel="다음" onPrevious={()=>{}} onNext={()=>{}} /></>)
    const frame=container.querySelector('.study-spotlight-frame') as HTMLElement
    expect(Number.parseFloat(frame.style.top)+Number.parseFloat(frame.style.height)).toBe(window.innerHeight-4)
  })
})
