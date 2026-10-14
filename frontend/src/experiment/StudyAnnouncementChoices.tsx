import { useEffect, useRef } from 'react'
import type { StudyAnnouncement } from './data'

export function StudyAnnouncementChoices({complexId,announcements,onSelect,onClose}:{
  complexId:string
  announcements:StudyAnnouncement[]
  onSelect:(id:string)=>void
  onClose:()=>void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const opener = document.activeElement
    const element = dialog.current
    element?.showModal()
    return ()=>{element?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus({preventScroll:true})}
  },[])
  return <dialog ref={dialog} className="study-choices" aria-label="이 단지의 진행 중 공고" onCancel={onClose} onClick={event=>{if(event.target === dialog.current) onClose()}}>
    <h2>이 단지의 진행 중 공고</h2><p>확인할 공고를 선택해 주세요.</p>
    {announcements.map(a=><button key={`${a.id}:${complexId}`} type="button" onClick={()=>onSelect(a.id)}>
      <small>{a.agency} · {a.status === 'APPLYING' ? '접수중' : '공고중'}</small><strong>{a.title}</strong><span>{a.dateLabel}</span>
    </button>)}
    <button type="button" onClick={onClose}>닫기</button>
  </dialog>
}
