import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '../design-system/components/Button'

export interface StudyTip { target: string; title: string; text: string }

interface Props {
  tip: StudyTip
  index: number
  total: number
  label: string
  nextLabel: string
  onPrevious: () => void
  onNext: () => void
  onClose?: () => void
  onTargetActivate?: () => void
}
interface Placement {
  frame: {left:number; top:number; width:number; height:number} | null
  left: number; top: number; width: number; maxHeight: number
}

/** Keep the explanation next to the actual visible control, including mobile scrollable filters. */
export function StudySpotlight({tip,index,total,label,nextLabel,onPrevious,onNext,onClose,onTargetActivate}: Props) {
  const activateRef = useRef(onTargetActivate)
  activateRef.current=onTargetActivate
  const card = useRef<HTMLElement>(null)
  const [placement,setPlacement] = useState<Placement | null>(null)
  useLayoutEffect(() => {
    let selected: HTMLElement | null = null
    let originalDescription: string | null = null
    let frame = 0
    let disposed = false
    const activate = () => activateRef.current?.()
    const resize = new ResizeObserver(() => schedule())
    function release() {
      if (!selected) return
      selected.removeEventListener('click',activate)
      selected.classList.remove('study-spotlit')
      if (originalDescription === null) selected.removeAttribute('aria-describedby')
      else selected.setAttribute('aria-describedby',originalDescription)
      resize.unobserve(selected)
    }
    function measure() {
      if (disposed) return
      const candidate = [...document.querySelectorAll<HTMLElement>(tip.target)].find(element => {
        const bounds=element.getBoundingClientRect()
        return bounds.width>0 && bounds.height>0 && !element.closest('[inert], [hidden]')
      }) ?? null
      if (candidate !== selected) {
        release()
        selected=candidate
        if (selected) {
          originalDescription=selected.getAttribute('aria-describedby')
          selected.classList.add('study-spotlit')
          selected.addEventListener('click',activate)
          selected.setAttribute('aria-describedby',[originalDescription,'study-tip-description'].filter(Boolean).join(' '))
          selected.scrollIntoView({block:'nearest',inline:'nearest'})
          if (selected.matches('button,input,[tabindex]')) selected.focus({preventScroll:true})
          resize.observe(selected)
        }
      }
      const width=Math.min(340,window.innerWidth-32), height=card.current?.offsetHeight ?? 240
      const bounds=selected?.getBoundingClientRect()
      const target=bounds ? {left:Math.max(4,bounds.left-5),top:Math.max(4,bounds.top-5),width:Math.min(bounds.width+10,window.innerWidth-8),height:Math.min(bounds.height+10,window.innerHeight-8)} : null
      let left=window.innerWidth-width-16, top=window.innerHeight-height-24
      if (bounds) {
        left=Math.max(16,Math.min(bounds.left,window.innerWidth-width-16))
        if(bounds.bottom+height+24<=window.innerHeight) top=bounds.bottom+16
        else if(bounds.top-height-16>=16) top=bounds.top-height-16
      }
      const next={frame:target,left,top:Math.max(16,top),width,maxHeight:window.innerHeight-32}
      setPlacement(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next)
    }
    function schedule() { cancelAnimationFrame(frame); frame=requestAnimationFrame(measure) }
    measure()
    if(card.current) resize.observe(card.current)
    const changes=new MutationObserver(schedule)
    changes.observe(document.body,{childList:true,subtree:true})
    window.addEventListener('resize',schedule)
    document.addEventListener('scroll',schedule,true)
    return () => {
      disposed=true;cancelAnimationFrame(frame);changes.disconnect();resize.disconnect();release()
      window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true)
    }
  },[tip.target])
  return <>
    {placement?.frame && <div className="study-spotlight-frame" style={placement.frame} aria-hidden="true" />}
    <section ref={card} className="study-tip" role="note" aria-label={label}
      style={placement ? {left:placement.left,top:placement.top,width:placement.width,maxHeight:placement.maxHeight} : undefined}>
      <div className="study-tip-heading"><span className="study-eyebrow">{label} · {index+1} / {total}</span>{onClose && <button onClick={onClose} aria-label="방법 안내 닫기">×</button>}</div>
      <h2>{tip.title}</h2><p id="study-tip-description">{tip.text}</p>
      <div className="study-tip-actions"><button disabled={index===0} onClick={onPrevious}>이전</button><Button onClick={onNext}>{nextLabel}</Button></div>
    </section>
  </>
}
