import { useEffect, useRef, useState, type ReactNode } from 'react'

function EntryDialog({titleId, children, onCancel}: {titleId:string; children:ReactNode; onCancel?:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const element=dialog.current, opener=document.activeElement
    element?.showModal()
    element?.querySelector<HTMLElement>('h1, h2')?.focus({preventScroll:true})
    return ()=>{element?.close();if(opener instanceof HTMLElement && opener.isConnected) opener.focus({preventScroll:true})}
  },[])
  return <dialog ref={dialog} className="study-entry-dialog study-intro" aria-labelledby={titleId}
    onCancel={event=>{event.preventDefault();onCancel?.()}}>{children}</dialog>
}

export function StudyWelcome({onStart}: {onStart:()=>void}) {
  const [declined,setDeclined]=useState(false)
  if(declined) return <EntryDialog key="declined" titleId="study-declined-title">
    <h1 id="study-declined-title" tabIndex={-1}>참여하지 않으셔도 괜찮아요.</h1>
    <p>이 탭을 닫으면 참여를 종료할 수 있습니다. 페이지에 접속한 뒤 수집된 방문·화면 조작 기록은 남습니다.</p>
    <button className="study-primary" onClick={()=>setDeclined(false)}>안내로 돌아가기</button>
  </EntryDialog>
  return <EntryDialog key="welcome" titleId="study-welcome-title">
    <img src="/logo-bok-search.svg" alt="복덕방" width="48" height="48" />
    <span className="study-eyebrow">공공주택 지도 · 복덕방</span>
    <h1 id="study-welcome-title" tabIndex={-1}>설문을 시작하기 전에,<br />서비스를 간단히 소개할게요.</h1>
    <p>공공주택 단지와 모집공고를 찾는 서비스예요. 소개 후 버튼들을 눌러 보고, 두 방법을 체험해 주세요.</p>
    <p className="study-muted">지금 보이는 단지·위치·모집조건은 임시로 넣은 체험용 데이터입니다.</p>
    <div className="study-consent-notice">
      <p>공고를 찾는 두 방법을 개선하기 위해 이 페이지에 접속한 시점부터 방문, 클릭과 탐색 과정, 힌트 사용, 소요 시간, 평가·설문 응답을 수집합니다. 체험 화면과 조작 과정은 세션 리플레이로 기록되며, 체험을 시작하거나 설문을 제출하지 않고 나간 경우에도 수집된 기록은 남습니다.</p>
      <p>이름과 연락처는 입력받지 않으며, 임의의 참여번호로 체험 기록과 설문 응답을 연결합니다. 입력값은 리플레이에서 가립니다.</p>
      <p>실험 페이지는 일주일간 운영합니다. 종료 후 페이지와 식별자를 제거하고, 사용자를 식별할 수 없도록 처리한 실험 기록은 제품 개선과 실험 결과 정리를 위해 보관합니다.</p>
      <p>체험과 설문 참여는 자유이며, 원하지 않으면 이 탭을 닫으셔도 됩니다. 설문에는 개인을 알아볼 수 있는 정보를 적지 말아 주세요.</p>
      <details><summary>기록을 보관하는 서비스</summary><p>PostHog는 행동 기록·세션 리플레이에, Tally와 연동 Google Sheets는 설문 응답과 체험 결과 보관에 사용합니다. 설문 내부 입력 화면은 리플레이에 포함하지 않습니다.</p></details>
    </div>
    <div className="study-entry-actions"><button className="study-primary" onClick={onStart}>시작할게요 <span aria-hidden="true">→</span></button>
      <button className="study-secondary" onClick={()=>setDeclined(true)}>참여하지 않기</button></div>
  </EntryDialog>
}

export function StudyExplorePrompt({onStart,onExplore}: {onStart:()=>void;onExplore:()=>void}) {
  return <EntryDialog titleId="study-explore-title" onCancel={onExplore}>
    <span className="study-eyebrow">서비스 소개 완료</span>
    <h2 id="study-explore-title" tabIndex={-1}>이제 두 방법을 체험해 볼까요?</h2>
    <p>공고를 찾는 두 가지 방법을 직접 사용하고 의견을 남겨 주세요. 조금 더 살펴보고 싶다면 지도의 버튼들을 자유롭게 눌러 보셔도 좋아요.</p>
    <div className="study-entry-actions"><button className="study-primary" onClick={onStart}>준비됐어요, 설문 시작하기</button>
      <button className="study-secondary" onClick={onExplore}>조금 더 둘러보기</button></div>
  </EntryDialog>
}
