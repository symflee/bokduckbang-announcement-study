import { useId } from 'react'
import { IconButton } from '../../design-system/components/IconButton.tsx'
import type { CurrentLocationState } from './useCurrentLocation.ts'
import styles from './CurrentLocationControl.module.css'

export function CurrentLocationControl({ state, onLocate }: {
  readonly state: CurrentLocationState
  readonly onLocate: () => void
}) {
  const statusId = useId()
  const message = state.kind === 'loading'
    ? '내 주변 주택을 보여드리기 위해 현재 위치를 확인합니다.'
    : state.kind === 'error' ? state.message : null
  return (
    <div className={styles.control}>
      <IconButton label="현재 위치로 이동" title="현재 위치로 이동" size="lg"
        disabled={state.kind === 'loading'} aria-busy={state.kind === 'loading'}
        aria-describedby={message ? statusId : undefined} onClick={onLocate}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </IconButton>
      <div id={statusId} role="status" aria-live="polite" className={styles.status} hidden={!message}>
        {message}
      </div>
    </div>
  )
}
