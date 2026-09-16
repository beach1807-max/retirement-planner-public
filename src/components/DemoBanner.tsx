import { Eye, ArrowRight } from 'lucide-react'

interface Props {
  onExitDemo: () => void
}

export function DemoBanner({ onExitDemo }: Props) {
  return (
    <aside className="demo-banner" role="region" aria-label="展示模式提示">
      <div className="demo-banner-content">
        <span className="demo-badge">
          <Eye size={16} aria-hidden="true" />
          <span>範例模式</span>
        </span>
        <p className="demo-banner-text">
          您目前正在瀏覽範例展示資料，操作不會寫入這台裝置的本機資料庫。
        </p>
      </div>
      <button
        type="button"
        className="button secondary small demo-exit-button"
        onClick={onExitDemo}
      >
        <span>開始我的個人規劃</span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </aside>
  )
}
