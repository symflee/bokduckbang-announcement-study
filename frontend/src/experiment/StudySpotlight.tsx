import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../design-system/components/Button'
import { StudyPinLegend } from './StudyPinLegend'

export interface StudyTip { target: string; title: string; text: string; pinLegend?: boolean; portalTarget?: string; focusTarget?: boolean }

interface Props {
  tip: StudyTip
  index: number
  total: number
  label: string
  nextLabel: string
  onPrevious: () => void
  onNext: () => void
  onClose?: () => void
  closeLabel?: string
  onTargetActivate?: () => void
}
interface Placement {
  frame: {left:number; top:number; width:number; height:number} | null
  left: number; top: number; width: number; maxHeight: number
}

/** Keep the explanation next to the actual visible control, including mobile scrollable filters. */
export function StudySpotlight(props: Props) {
  if (props.tip.pinLegend) return <StudyPinLegend {...props} title={props.tip.title} text={props.tip.text} />
  return <AnchoredStudySpotlight {...props} />
}

function AnchoredStudySpotlight({tip,index,total,label,nextLabel,onPrevious,onNext,onClose,closeLabel='방법 안내 닫기',onTargetActivate}: Props) {
  const activateRef = useRef(onTargetActivate)
  activateRef.current=onTargetActivate
  const card = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [placement,setPlacement] = useState<Placement | null>(null)
  const [portalHost,setPortalHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(()=>{
    if(portalHost || tip.focusTarget===false) heading.current?.focus({preventScroll:true})
  },[portalHost,tip.focusTarget])
  useLayoutEffect(() => {
    let selected: HTMLElement | null = null
    let originalDescription: string | null = null
    let frame = 0
    let disposed = false
    const activate = () => activateRef.current?.()
    const resize = new ResizeObserver(() => schedule())
    function release() {
      if (!selected) return
      selected.removeEventListener('click',activate,true)
      selected.classList.remove('study-spotlit')
      if (originalDescription === null) selected.removeAttribute('aria-describedby')
      else selected.setAttribute('aria-describedby',originalDescription)
      resize.unobserve(selected)
    }
    function measure() {
      if (disposed) return
      setPortalHost(tip.portalTarget ? document.querySelector<HTMLElement>(tip.portalTarget) : null)
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
          selected.addEventListener('click',activate,true)
          selected.setAttribute('aria-describedby',[originalDescription,'study-tip-description'].filter(Boolean).join(' '))
          if (selected.matches('button,input,[tabindex]')) {
            selected.scrollIntoView({block:'nearest',inline:'nearest'})
            if(tip.focusTarget!==false) selected.focus({preventScroll:true})
          }
          resize.observe(selected)
        }
      }
      const width=Math.min(340,window.innerWidth-32), height=card.current?.offsetHeight ?? 240
      const bounds=selected?.getBoundingClientRect()
      const padding=selected?.matches('button,input,[tabindex]') ? 5 : 0
      const leftEdge=Math.max(4,(bounds?.left ?? 0)-padding), topEdge=Math.max(4,(bounds?.top ?? 0)-padding)
      const target=bounds ? {left:leftEdge,top:topEdge,width:Math.max(0,Math.min(bounds.right+padding,window.innerWidth-4)-leftEdge),height:Math.max(0,Math.min(bounds.bottom+padding,window.innerHeight-4)-topEdge)} : null
      let left=window.innerWidth-width-16, top=window.innerHeight-height-24
      if (bounds) {
        left=Math.max(16,Math.min(bounds.left,window.innerWidth-width-16))
        if(bounds.width>width && bounds.right+width+32<=window.innerWidth) {left=bounds.right+16;top=bounds.top}
        else if(bounds.bottom+height+24<=window.innerHeight) top=bounds.bottom+16
        else if(bounds.top-height-16>=16) top=bounds.top-height-16
      }
      const next={frame:target,left,top:Math.max(16,top),width,maxHeight:window.innerHeight-32}
      setPlacement(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next)
      // Panel transforms do not notify ResizeObserver. Follow their transition too.
      for(let element=selected;element;element=element.parentElement) {
        if(element.getAnimations?.().some(animation=>animation.playState==='running')) {schedule();break}
      }
    }
    function schedule() { cancelAnimationFrame(frame); frame=requestAnimationFrame(measure) }
    measure()
    if(card.current) resize.observe(card.current)
    const changes=new MutationObserver(schedule)
    changes.observe(document.body,{childList:true,subtree:true})
    window.addEventListener('resize',schedule)
    document.addEventListener('scroll',schedule,true)
    document.addEventListener('transitionrun',schedule,true)
    document.addEventListener('transitionend',schedule,true)
    return () => {
      disposed=true;cancelAnimationFrame(frame);changes.disconnect();resize.disconnect();release()
      window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true)
      document.removeEventListener('transitionrun',schedule,true);document.removeEventListener('transitionend',schedule,true)
    }
  },[tip.target,tip.portalTarget,tip.focusTarget])
  // A panel guide has one home. Wait for that panel instead of flashing a floating copy.
  if(tip.portalTarget && !portalHost) return null
  const content = <section ref={card} className="study-tip" role="note" aria-label={label}
      style={portalHost ? {position:'static',width:'100%',maxHeight:'none',margin:'16px 0 0',boxShadow:'none'} : placement ? {left:placement.left,top:placement.top,width:placement.width,maxHeight:placement.maxHeight} : undefined}>
      <div className="study-tip-heading"><span className="study-eyebrow">{label} · {index+1} / {total}</span>{onClose && <button type="button" onClick={onClose} aria-label={closeLabel}>×</button>}</div>
      <h2 ref={heading} tabIndex={-1}>{tip.title}</h2><p id="study-tip-description">{tip.text}</p>
      <div className="study-tip-actions">{total > 1 && <button type="button" disabled={index===0} onClick={onPrevious}>이전</button>}<Button onClick={onNext}>{nextLabel}</Button></div>
    </section>
  return <>
    {placement?.frame && !portalHost && <div className="study-spotlight-frame" style={placement.frame} aria-hidden="true" />}
    {portalHost ? createPortal(content,portalHost) : content}
  </>
}
