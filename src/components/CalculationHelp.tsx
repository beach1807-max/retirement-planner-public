import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { calculationHelp, type CalculationHelpContent, type CalculationHelpTopic } from '../content/calculation-help'

interface Props { topic: CalculationHelpTopic; label?: ReactNode; align?: 'start' | 'end' }

export function CalculationHelp({ topic, label, align = 'start' }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const generatedId = useId()
  const popoverId = `calculation-help-${generatedId.replaceAll(':', '')}`
  const content: CalculationHelpContent = calculationHelp[topic]

  useEffect(() => {
    const closeOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== popoverId) setOpen(false)
    }
    document.addEventListener('calculation-help-open', closeOther)
    return () => document.removeEventListener('calculation-help-open', closeOther)
  }, [popoverId])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [open])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) document.dispatchEvent(new CustomEvent('calculation-help-open', { detail: popoverId }))
  }

  return <span className="calculation-help" ref={rootRef}>
    {label && <span className="calculation-help-label">{label}</span>}
    <button type="button" className="calculation-help-trigger" aria-label={`說明：${content.title}`} aria-expanded={open} aria-controls={popoverId} onClick={toggle}><HelpCircle size={17} aria-hidden="true" /></button>
    {open && <span className={`calculation-help-popover ${align === 'end' ? 'align-end' : ''}`} id={popoverId} role="dialog" aria-label={`${content.title}計算說明`}>
      <span className="calculation-help-heading"><strong>{content.title}</strong><button type="button" className="calculation-help-close" aria-label={`關閉${content.title}說明`} onClick={() => setOpen(false)}><X size={16} aria-hidden="true" /></button></span>
      <span className="calculation-help-summary">{content.summary}</span>
      {content.formula && <code>{content.formula}</code>}
      {content.note && <small>{content.note}</small>}

    </span>}
  </span>
}
