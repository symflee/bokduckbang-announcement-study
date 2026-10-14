import { useEffect, useRef } from 'react'
import { Button } from '../design-system/components/Button'
import { METHOD_NAMES, type IntroducedStep, type MethodOrder } from './state'

const STAGES = ['첫 번째 방법', '두 번째 방법', '비교·설문']
export function StudyStepIntroduction({step, order, onStart}: {step:IntroducedStep; order:MethodOrder; onStart:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const method = step === 'old-task' ? 'old' : step === 'new-task' ? 'new' : null
  const stage = method ? order.indexOf(method) : 2
  const ordinal = stage === 0 ? '첫 번째' : '두 번째'
  useEffect(() => {
    const element=dialog.current, opener=document.activeElement
    element?.showModal()
    heading.current?.focus({preventScroll:true})
    return ()=>{element?.close(); if(opener instanceof HTMLElement && opener.isConnected) opener.focus({preventScroll:true})}
  },[])
  return <dialog ref={dialog} className="study-step-introduction" aria-modal="true" aria-labelledby="study-step-title"
    aria-describedby="study-step-description" onCancel={event=>event.preventDefault()}>
    <ol className="study-step-progress" aria-label="체험 순서">
      {STAGES.map((label,index)=><li key={label} aria-current={index===stage?'step':undefined} className={index<stage?'is-done':undefined}><span aria-hidden="true" />{label}</li>)}
    </ol>
    <span className="study-step-badge">{stage+1} / 3 · {method ? `${ordinal} 방법` : '비교·설문'}</span>
    <h2 ref={heading} id="study-step-title" tabIndex={-1}>{method ? METHOD_NAMES[method] : '두 가지 방법,\n어떻게 달랐나요?'}</h2>
    {method && <div className="study-step-mission"><span>이번에 할 일</span><p>서울에서 공고중·접수중인 단지를 하나 찾아 모집공고를 열어 보세요.</p></div>}
    <p id="study-step-description" className="study-step-description">{method === 'old'
      ? '모집상태 필터로 공고가 있는 단지를 골라요.'
      : method === 'new' ? '공고지도에서 위치와 공고 요약을 함께 봐요.'
      : '두 방법을 다시 둘러보고, 어떤 방식을 선호하는지와 공고지도가 필요한지 알려 주세요.'}</p>
    {method && <p className="study-method-sequence">{method === 'old' ? '모집상태 → 공고중·접수중 → 단지 선택 → 모집공고 열기' : '공고지도 → 지역 확대 → 공고 요약 핀 선택'}</p>}
    <Button size="lg" className="study-step-start" onClick={onStart}>{method ? `${ordinal} 방법 시작하기` : '두 방법 비교하기'}<span aria-hidden="true">→</span></Button>
  </dialog>
}
