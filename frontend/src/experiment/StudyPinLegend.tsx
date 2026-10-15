import { useEffect, useLayoutEffect, useRef } from 'react'
import { Button } from '../design-system/components/Button'
import { createComplexMarkerButton } from '../maps/naver/complexMarkerButton'
import type { NaverMapComplexMarker } from '../maps/naver/naverMapTypes'
import styles from './StudyPinLegend.module.css'

interface Props {
  title: string
  text: string
  index: number
  total: number
  label: string
  nextLabel: string
  onPrevious: () => void
  onNext: () => void
}

const PIN_EXAMPLES = [
  { status: null, label: '공고없음', description: '현재 진행 중인 공고가 없어요.' },
  { status: 'BEFORE_APPLICATION', label: '공고중', description: '공고가 올라왔고, 접수 시작 전이에요.' },
  { status: 'APPLYING', label: '접수중', description: '현재 신청을 접수하고 있어요.' },
] as const

function PinExample({ status }: { status: NaverMapComplexMarker['applicationStatus'] }) {
  const container = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const pin = createComplexMarkerButton({
      id: 'tour-example', name: '예시 행복주택', latitude: 0, longitude: 0,
      agencyLabel: 'LH', agencyName: '한국토지주택공사',
      rentalTypeLabel: '행복', rentalTypeName: '행복주택', exclusiveAreaLabel: '36㎡',
      deposit: { digits: '2.4', unit: '천', exactLabel: '2,400만 원' },
      monthlyRent: { digits: '18', unit: '만', exactLabel: '18만 원' },
      applicationStatus: status, selected: false,
    })
    pin.disabled = true
    pin.tabIndex = -1
    pin.removeAttribute('data-map-complex-marker')
    pin.removeAttribute('data-complex-id')
    element.replaceChildren(pin)
    return () => element.replaceChildren()
  }, [status])
  return <div ref={container} className={styles.pin} aria-hidden="true" />
}

export function StudyPinLegend({ title, text, index, total, label, nextLabel, onPrevious, onNext }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element?.showModal()
    heading.current?.focus({ preventScroll: true })
    return () => {
      element?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="study-pin-legend-title"
    aria-describedby="study-pin-legend-description" onCancel={event => event.preventDefault()}>
    <span className="study-eyebrow">{label} · {index + 1} / {total}</span>
    <h2 ref={heading} id="study-pin-legend-title" tabIndex={-1}>{title}</h2>
    <p id="study-pin-legend-description">{text}</p>
    <ul className={styles.examples} aria-label="단지 핀 색상">
      {PIN_EXAMPLES.map(example => <li key={example.label}>
        <PinExample status={example.status} />
        <div><strong>{example.label}</strong><p>{example.description}</p></div>
      </li>)}
    </ul>
    <div className={styles.actions}>
      <button type="button" disabled={index === 0} onClick={onPrevious}>이전</button>
      <Button onClick={onNext}>{nextLabel}</Button>
    </div>
  </dialog>
}
