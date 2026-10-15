import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StudyPinLegend } from './StudyPinLegend'
import { SERVICE_TOUR } from './serviceTour'

describe('서비스 소개의 핀 색상 안내', () => {
  it('한 모달에서 실제 핀 모양을 공고없음, 공고중, 접수중 순서로 보여 준다', () => {
    const previous = vi.fn(), next = vi.fn()
    render(<StudyPinLegend title="핀 색으로 상태를 구분해요" text="상태를 확인할 수 있어요."
      index={2} total={10} label="서비스 소개" nextLabel="다음" onPrevious={previous} onNext={next} />)
    const dialog = screen.getByRole('dialog', { name: '핀 색으로 상태를 구분해요' })
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByRole('heading')).toHaveFocus()
    const examples = within(dialog).getByRole('list', { name: '단지 핀 색상' })
    expect([...examples.querySelectorAll('strong')].map(element => element.textContent)).toEqual(['공고없음', '공고중', '접수중'])
    const pins = [...examples.querySelectorAll<HTMLButtonElement>('.housing-map-marker')]
    expect(pins.map(pin => pin.getAttribute('data-application-status'))).toEqual([null, 'BEFORE_APPLICATION', 'APPLYING'])
    for (const pin of pins) {
      expect(pin.querySelector('.housing-map-marker__surface')).not.toBeNull()
      expect(pin.querySelector('.housing-map-marker__content')).not.toBeNull()
      expect(pin).not.toHaveClass('is-selected')
      expect(pin).not.toHaveAttribute('data-map-complex-marker')
      expect(pin).toBeDisabled()
    }
    expect(dialog).not.toHaveTextContent('선택한 단지')
    fireEvent.click(within(dialog).getByRole('button', { name: '이전' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '다음' }))
    expect(previous).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
  })

  it('안내는 10단계이고 제거한 네 기능을 소개하지 않으며 필터와 상세 설명은 유지한다', () => {
    expect(SERVICE_TOUR).toHaveLength(10)
    const titles = SERVICE_TOUR.map(step => step.title)
    for (const removed of ['원하는 곳을 검색해요', '공급기관으로 골라요', '봤던 단지를 다시 찾아요', '지도를 확대하거나 축소해요']) {
      expect(titles).not.toContain(removed)
    }
    expect(SERVICE_TOUR.filter(step => step.filterPreview === 'applicationStatus')).toHaveLength(1)
    expect(titles).toEqual(expect.arrayContaining(['단지 정보를 상세히 볼 수 있어요', '단지 정보에서 공고를 볼 수 있어요', '모집조건과 일정을 확인할 수 있어요', '공고 정보를 자세히 볼 수 있어요']))
    expect(SERVICE_TOUR.at(-1)?.nextLabel).toBe('직접 둘러보기')
  })
})
