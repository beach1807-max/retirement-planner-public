import { Component, type ErrorInfo, type ReactNode } from 'react'
import { resetAppCache } from './app-recovery'

interface Props { children: ReactNode }
interface State { failed: boolean; recovering: boolean; recoveryFailed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, recovering: false, recoveryFailed: false }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application render failed', error, info)
  }

  private recover = async (): Promise<void> => {
    this.setState({ recovering: true, recoveryFailed: false })
    try {
      await resetAppCache()
      window.location.reload()
    } catch (error) {
      console.error('Application cache recovery failed', error)
      this.setState({ recovering: false, recoveryFailed: true })
    }
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children

    return (
      <main className="recovery-screen">
        <section className="recovery-card" role="alert">
          <p className="eyebrow">載入發生問題</p>
          <h1>需要重新取得最新版</h1>
          <p>瀏覽器可能仍在使用舊版程式。重新載入最新版只會清除網站程式快取，不會刪除儲存在此瀏覽器的退休規劃資料。</p>
          {this.state.recoveryFailed && <p className="field-error">自動復原失敗，請先關閉所有本站分頁後再重新開啟。</p>}
          <div className="recovery-actions">
            <button className="button primary" type="button" disabled={this.state.recovering} onClick={this.recover}>
              {this.state.recovering ? '正在更新…' : '重新載入最新版'}
            </button>
            <button className="button secondary" type="button" onClick={() => window.location.reload()}>只重新整理</button>
          </div>
        </section>
      </main>
    )
  }
}
