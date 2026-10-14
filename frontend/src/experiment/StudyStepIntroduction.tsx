import { useEffect, useRef } from 'react'
import { Button } from '../design-system/components/Button'
import type { IntroducedStep } from './state'

const TASK = '공고가 올라온 단지를 찾고, 공고 내용을 확인해 주세요.'
const STAGES = ['서비스 소개', '첫 번째 방법', '두 번째 방법', '비교와 설문']
const INTRODUCTIONS = {
  warmup: {
    stage: 0, badge: '준비 · 서비스 소개', title: '먼저, 서비스를\n짧게 소개할게요.',
    description: '복덕방은 공공주택의 위치와 모집공고를 함께 찾아보는 서비스예요. 주요 버튼을 짧게 안내한 뒤, 두 가지 방법의 체험을 시작합니다.',
    action: '서비스 소개 시작',
  },
  'old-task': {
    stage: 1, badge: '방법 1 / 2', title: '첫 번째 방법을\n시작합니다.',
    description: '지금 보이는 지도에서 편한 방법으로 공고를 찾아보세요. 필요하면 언제든 도움을 받을 수 있어요.',
    action: '첫 번째 방법 시작하기',
  },
  'new-task': {
    stage: 2, badge: '방법 2 / 2', title: '두 번째 방법을\n시작합니다.',
    description: '같은 지도 범위에서 같은 과제를 한 번 더 해볼게요. 필요하면 언제든 도움을 받을 수 있어요.',
    action: '두 번째 방법 시작하기',
  },
  compare: {
    stage: 3, badge: '마지막 단계 · 비교와 설문', title: '두 가지 방법,\n어떻게 달랐나요?',
    description: '단지지도와 공고지도를 자유롭게 오가며 다시 살펴보세요. 비교가 끝나면 설문에서 의견을 들려주세요.',
    action: '두 방법 다시 살펴보기',
  },
} satisfies Record<IntroducedStep, {stage: number; badge: string; title: string; description: string; action: string}>

export function StudyStepIntroduction({step, onStart}: {step: IntroducedStep; onStart: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const content = INTRODUCTIONS[step]
  const isTask = step === 'old-task' || step === 'new-task'

  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element?.showModal()
    heading.current?.focus({preventScroll: true})
    return () => {
      element?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({preventScroll: true})
    }
  }, [])

  return <dialog ref={dialog} className="study-step-introduction" aria-modal="true"
    aria-labelledby="study-step-title" aria-describedby="study-step-description"
    onCancel={event => event.preventDefault()}>
    <ol className="study-step-progress" aria-label="체험 순서">
      {STAGES.map((label, index) => <li key={label} aria-current={index === content.stage ? 'step' : undefined}
        className={index < content.stage ? 'is-done' : undefined}>
        <span aria-hidden="true" />{label}
      </li>)}
    </ol>
    <span className="study-step-badge">{content.badge}</span>
    <h2 ref={heading} id="study-step-title" tabIndex={-1}>{content.title}</h2>
    {isTask && <div className="study-step-mission"><span>이번에 할 일</span><p>{TASK}</p></div>}
    <p id="study-step-description" className="study-step-description">{content.description}</p>
    <Button size="lg" className="study-step-start" onClick={onStart}>{content.action}<span aria-hidden="true">→</span></Button>
    {isTask && <p className="study-step-note">시작하기를 누른 뒤부터 체험 시간이 기록됩니다.</p>}
  </dialog>
}
