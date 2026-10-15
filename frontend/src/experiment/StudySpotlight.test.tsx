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
  it.each([1024,375])('필터 안내와 이동 버튼을 실제 필터 창 안에 한 번만 표시한다 (%i px)',async width=>{
    vi.stubGlobal('innerWidth',width)
    const onNext=vi.fn(), onApply=vi.fn()
    render(<><ComplexFilterToolbar filters={{}} onApply={onApply} previewTopic="applicationStatus" />
      <StudySpotlight tip={{target:'[data-study-filter-panel="applicationStatus"]',portalTarget:'[data-study-filter-guide-host]',title:'모집 상태로 골라요',text:'원하는 상태의 단지를 볼 수 있어요.'}}
        index={1} total={10} label="서비스 소개" nextLabel="다음" onPrevious={()=>{}} onNext={onNext} /></>)
    await act(()=>vi.advanceTimersByTimeAsync(40))
    const dialog=screen.getByRole(width>767?'region':'dialog',{name:'모집상태 필터'})
    const guide=within(dialog).getByRole('note',{name:'서비스 소개'})
    expect(screen.getAllByRole('note',{name:'서비스 소개'})).toHaveLength(1)
    expect(guide).toHaveTextContent('모집 상태로 골라요')
    fireEvent.click(within(guide).getByRole('button',{name:'다음'}))
    expect(onNext).toHaveBeenCalledOnce()
    fireEvent.click(within(guide).getByRole('button',{name:'이전'}))
    expect(onApply).not.toHaveBeenCalled()
  })
  it('필터 창이 준비되기 전에 같은 안내를 바깥에 먼저 표시하지 않는다',()=>{
    render(<StudySpotlight tip={{target:'[data-study-filter-panel="applicationStatus"]',portalTarget:'[data-study-filter-guide-host]',title:'모집 상태로 골라요',text:'필터 안내'}}
      index={1} total={10} label="서비스 소개" nextLabel="다음" onPrevious={()=>{}} onNext={()=>{}} />)
    expect(screen.queryByRole('note',{name:'서비스 소개'})).not.toBeInTheDocument()
  })
  it('핀 소개는 핀을 자동 포커스해 펼치지 않고 안내 제목에 포커스를 둔다',()=>{
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(60,200,92,54))
    HTMLElement.prototype.scrollIntoView=vi.fn()
    render(<><button id="tour-pin">단지 핀</button><StudySpotlight tip={{target:'#tour-pin',focusTarget:false,title:'단지 핀을 눌러 보세요',text:'핀 소개'}}
      index={3} total={10} label="서비스 소개" nextLabel="다음" onPrevious={()=>{}} onNext={()=>{}} /></>)
    expect(screen.getByRole('heading',{name:'단지 핀을 눌러 보세요'})).toHaveFocus()
    expect(screen.getByRole('button',{name:'단지 핀'})).not.toHaveFocus()
    expect(screen.getByRole('button',{name:'단지 핀'})).toHaveClass('study-spotlit')
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
