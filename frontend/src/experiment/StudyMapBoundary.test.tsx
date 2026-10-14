import { render, screen, fireEvent } from '@testing-library/react'
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
})
