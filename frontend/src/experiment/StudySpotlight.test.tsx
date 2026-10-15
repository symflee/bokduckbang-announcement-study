import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudySpotlight } from './StudySpotlight'
import { ComplexFilterToolbar } from '../public-housing/filters/ComplexFilterToolbar'

beforeEach(()=>{
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}})
})
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('소개 강조 위치',()=>{
  it('모바일 필터 안내를 실제 필터 대화상자 안에 넣어 다음 버튼을 사용할 수 있게 한다',async()=>{
    vi.stubGlobal('innerWidth',375)
    const onNext=vi.fn(), onApply=vi.fn()
    render(<><ComplexFilterToolbar filters={{}} onApply={onApply} previewTopic="applicationStatus" />
      <StudySpotlight tip={{target:'[data-study-filter-panel="applicationStatus"]',portalTarget:'[data-study-filter-guide-host]',title:'모집 상태로 골라요',text:'원하는 상태의 단지를 볼 수 있어요.'}}
        index={1} total={10} label="서비스 소개" nextLabel="다음" onPrevious={()=>{}} onNext={onNext} /></>)
    await act(()=>vi.advanceTimersByTimeAsync(40))
    const dialog=screen.getByRole('dialog',{name:'모집상태 필터'})
    const guide=within(dialog).getByRole('note',{name:'서비스 소개'})
    expect(guide).toHaveTextContent('모집 상태로 골라요')
    fireEvent.click(within(guide).getByRole('button',{name:'다음'}))
    expect(onNext).toHaveBeenCalledOnce()
    fireEvent.click(within(guide).getByRole('button',{name:'이전'}))
    expect(onApply).not.toHaveBeenCalled()
  })
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
  it('지도 핀이 클릭 전파를 막아도 시연 선택을 전달한다',()=>{
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(60,200,92,54))
    const onTargetActivate=vi.fn()
    const {container}=render(<><div id="tour-pin"/><StudySpotlight tip={{target:'#tour-pin',title:'핀 소개',text:'핀을 누르면 상세가 열립니다'}} index={0} total={1} label="소개" nextLabel="다음" onPrevious={()=>{}} onNext={()=>{}} onTargetActivate={onTargetActivate} /></>)
    const pin=container.querySelector('#tour-pin')!
    pin.addEventListener('click',event=>event.stopImmediatePropagation())
    fireEvent.click(pin)
    expect(onTargetActivate).toHaveBeenCalledOnce()
  })
  it('화면 밖으로 나간 부분은 강조 영역에서 제외한다',()=>{
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(60,600,400,500))
    const {container}=render(<><aside id="tour-panel"/><StudySpotlight tip={{target:'#tour-panel',title:'목록 소개',text:'공고 목록입니다'}} index={0} total={1} label="소개" nextLabel="다음" onPrevious={()=>{}} onNext={()=>{}} /></>)
    const frame=container.querySelector('.study-spotlight-frame') as HTMLElement
    expect(Number.parseFloat(frame.style.top)+Number.parseFloat(frame.style.height)).toBe(window.innerHeight-4)
  })
})
