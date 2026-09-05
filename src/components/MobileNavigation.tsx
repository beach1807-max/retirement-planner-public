import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, X, type LucideIcon } from 'lucide-react'

interface Item<T extends string> { id: T; label: string; icon: LucideIcon }

export function MobileNavigation<T extends string>({ items, page, onNavigate }: { items: Item<T>[]; page: T; onNavigate: (page: T) => void }) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!open) { dialog.current?.close(); return }
    dialog.current?.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])
  const extraActive = items.slice(4).some((item) => item.id === page)
  return <>
    <nav className="bottom-nav" aria-label="行動版主要功能">
      {items.slice(0, 4).map(({ id, label, icon: Icon }, index) => <button key={id} aria-label={label} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => onNavigate(id)}><Icon size={22} aria-hidden="true" /><span>{['預測', '家庭資料', '勞保勞退', '投資組合'][index]}</span></button>)}
      <button aria-label="更多功能" aria-haspopup="dialog" aria-expanded={open} className={extraActive ? 'active' : ''} onClick={() => setOpen(true)}><MoreHorizontal size={22} aria-hidden="true" /><span>更多</span></button>
    </nav>
    <dialog className="mobile-menu" ref={dialog} aria-labelledby="mobile-menu-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="mobile-menu-content"><div className="panel-heading"><h2 id="mobile-menu-title">更多功能</h2><button autoFocus className="icon-button" aria-label="關閉更多功能" onClick={() => setOpen(false)}><X size={22} /></button></div>
        <nav aria-label="其他功能">{items.slice(4).map(({ id, label, icon: Icon }) => <button key={id} aria-current={page === id ? 'page' : undefined} onClick={() => { setOpen(false); onNavigate(id) }}><Icon size={22} aria-hidden="true" />{label}</button>)}</nav>
      </div>
    </dialog>
  </>
}
