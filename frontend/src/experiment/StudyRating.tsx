import { useEffect, useRef } from 'react'
import { METHOD_NAMES, type EaseRating, type TrialKey } from './state'

export function StudyRating({method, ordinal, skipped, onRate}:{method:TrialKey; ordinal:number; skipped:boolean; onRate:(value:EaseRating)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null), heading=useRef<HTMLHeadingElement>(null)
  useEffect(()=>{const element=dialog.current; element?.showModal(); heading.current?.focus(); return ()=>element?.close()},[])
  const labels=['매우 어려웠다','어려웠다','보통이다','쉬웠다','매우 쉬웠다']
  return <dialog ref={dialog} className="study-step-introduction study-rating" aria-modal="true" aria-labelledby="study-rating-title" onCancel={event=>event.preventDefault()}>
    <span className="study-step-badge">{ordinal} / 3 · {METHOD_NAMES[method]}</span>
    <h2 ref={heading} id="study-rating-title" tabIndex={-1}>{skipped ? '이번 체험은\n여기까지 할게요.' : '공고 내용을 확인했어요.'}</h2>
    <p className="study-step-description">방금 사용한 ‘{METHOD_NAMES[method]}’로 공고를 찾기 얼마나 쉬웠나요?</p>
    <div className="study-rating-options" role="group" aria-label="찾기 쉬웠던 정도">
      {labels.map((label,index)=><button key={label} aria-label={`${index+1} ${label}`} onClick={()=>onRate((index+1) as EaseRating)}><strong>{index+1}</strong><span>{label}</span></button>)}
    </div>
    <button className="study-rating-unsure" onClick={()=>onRate('unsure')}>판단하기 어려워요</button>
    <p className="study-step-note">하나를 선택하면 {ordinal === 1 ? '두 번째 방법' : '비교·설문'}으로 넘어갑니다.</p>
  </dialog>
}
