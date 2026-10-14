import { act, render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StudyMapBoundary } from './StudyMapBoundary'

describe('study map failure recovery', () => {
  it('keeps a recovery action available and reports a failed map', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onFailure = vi.fn()
    const onRetry = vi.fn()
    function BrokenMap(): never { throw new Error('SDK initialization failed') }
    try {
      render(<StudyMapBoundary onFailure={onFailure} onRetry={onRetry}><BrokenMap /></StudyMapBoundary>)
      expect(screen.getByRole('alert')).toHaveTextContent('지도를 표시하지 못했어요.')
      expect(onFailure).toHaveBeenCalledOnce()
      fireEvent.click(screen.getByRole('button', { name: '지도 다시 불러오기' }))
      expect(onRetry).toHaveBeenCalledOnce()
    } finally {
      consoleError.mockRestore()
    }
  })
  it('recovers from an asynchronous NAVER SDK error and ignores unrelated scripts', () => {
    const onFailure = vi.fn()
    render(<StudyMapBoundary onFailure={onFailure} onRetry={vi.fn()}><p>지도 준비 중</p></StudyMapBoundary>)
    act(() => window.dispatchEvent(new ErrorEvent('error', { filename: 'https://other.example/script.js' })))
    expect(screen.getByText('지도 준비 중')).toBeInTheDocument()
    act(() => window.dispatchEvent(new ErrorEvent('error', { filename: 'https://oapi.map.naver.com/openapi/v3/maps.js' })))
    expect(screen.getByRole('alert')).toHaveTextContent('지도를 표시하지 못했어요.')
    act(() => window.dispatchEvent(new ErrorEvent('error', { filename: 'https://oapi.map.naver.com/openapi/v3/maps.js' })))
    expect(onFailure).toHaveBeenCalledOnce()
  })

  it('stops an unready map after 15 seconds, but never times out a ready map', () => {
    vi.useFakeTimers()
    const onFailure = vi.fn()
    try {
      const { rerender } = render(<StudyMapBoundary ready onFailure={onFailure} onRetry={vi.fn()}><p>정상 지도</p></StudyMapBoundary>)
      act(() => vi.advanceTimersByTime(30_000))
      expect(screen.getByText('정상 지도')).toBeInTheDocument()
      rerender(<StudyMapBoundary ready={false} onFailure={onFailure} onRetry={vi.fn()}><p>지도 준비 중</p></StudyMapBoundary>)
      act(() => vi.advanceTimersByTime(15_000))
      expect(screen.getByRole('alert')).toHaveTextContent('지도를 표시하지 못했어요.')
      expect(onFailure).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

})
