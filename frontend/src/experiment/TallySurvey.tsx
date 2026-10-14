import { useEffect, useRef, useState } from 'react'
import type { ExperimentSummary } from './state'

import { parseTallyEvent, tallyUrl } from './tallyAdapter'

export function TallySurvey({summary,onSubmitted}:{summary:ExperimentSummary;onSubmitted:(id:string)=>void}) {
  const formId = import.meta.env.VITE_TALLY_FORM_ID?.trim() ?? ''
  const iframe = useRef<HTMLIFrameElement>(null)
  const [loaded,setLoaded] = useState(false)
  const [failed,setFailed] = useState(false)
  useEffect(() => {
    if (!formId) return
    const timer = window.setTimeout(()=>setFailed(true), 15_000)
    function receive(event:MessageEvent) {
      if (event.origin !== 'https://tally.so' || !iframe.current || event.source !== iframe.current.contentWindow) return
      const message = parseTallyEvent(event.data,formId)
      if (message?.event === 'Tally.FormLoaded') { setLoaded(true); setFailed(false); clearTimeout(timer) }
      if (message?.event === 'Tally.FormSubmitted' && message.id) onSubmitted(message.id)
    }
    window.addEventListener('message',receive)
    return () => {clearTimeout(timer);window.removeEventListener('message',receive)}
  },[formId,onSubmitted])
  if (!formId) return <div role="status"><p>설문 연결을 준비하고 있습니다. 아직 응답을 수집하지 않습니다.</p><p>현재 페이지는 사전 점검용입니다. 설문이 연결된 뒤 참여해 주세요.</p></div>
  return <>
    {!loaded && !failed && <p role="status">설문을 불러오고 있습니다…</p>}
    {failed && <p role="alert">설문을 불러오지 못했습니다. 아래 링크로 열면 같은 체험 기록이 전달됩니다.</p>}
    <iframe ref={iframe} title="공고지도 체험 설문" src={tallyUrl(formId,summary,true)} className="study-survey-frame" onError={()=>setFailed(true)} />
    <p className="study-muted"><a href={tallyUrl(formId,summary,false)} target="_blank" rel="noreferrer">설문을 새 창에서 열기 ↗</a><br />새 창에서 제출하면 해당 설문 창의 완료 안내를 확인해 주세요. 이 페이지에서는 외부 창의 제출을 확인할 수 없습니다.</p>
  </>
}
