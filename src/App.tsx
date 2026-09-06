import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ArchiveRestore, ChartNoAxesCombined, Database, FlaskConical, House, PieChart, RefreshCw, Scale, Settings } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { createDemoData, type PlannerData } from './application/planner-data'
import { noopAnalytics } from './application/analytics'
import { PlannerService } from './application/planner-service'
import { ScenarioService } from './application/scenario-service'
import { MarketDataService } from './application/market-data-service'
import type { ProjectionResult } from './domain/models'
import { Onboarding } from './components/Onboarding'
import { DexiePlannerRepository } from './infrastructure/dexie-planner-repository'
import { OfficialTaiwanMarketDataProvider } from './infrastructure/market-data-provider'
import { MobileNavigation } from './components/MobileNavigation'

type Page = 'dashboard' | 'data' | 'retirementSystems' | 'portfolio' | 'scenarios' | 'market' | 'settings' | 'backup'

const repository = new DexiePlannerRepository()
const plannerService = new PlannerService(repository)
const scenarioService = new ScenarioService(plannerService)
const marketDataService = new MarketDataService(new OfficialTaiwanMarketDataProvider())
const Dashboard = lazy(() => import('./components/Dashboard').then((module) => ({ default: module.Dashboard })))
const DataPage = lazy(() => import('./components/DataPage').then((module) => ({ default: module.DataPage })))
const SettingsPage = lazy(() => import('./components/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const RetirementSystemsPage = lazy(() => import('./components/RetirementSystemsPage').then((module) => ({ default: module.RetirementSystemsPage })))
const PortfolioPage = lazy(() => import('./components/PortfolioPage').then((module) => ({ default: module.PortfolioPage })))
const ScenarioPage = lazy(() => import('./components/ScenarioPage').then((module) => ({ default: module.ScenarioPage })))
const MarketDataPage = lazy(() => import('./components/MarketDataPage').then((module) => ({ default: module.MarketDataPage })))
const BackupPage = lazy(() => import('./components/BackupPage').then((module) => ({ default: module.BackupPage })))

const navigation: Array<{ id: Page; label: string; icon: typeof House }> = [
  { id: 'dashboard', label: '投資與退休預測', icon: ChartNoAxesCombined },
  { id: 'scenarios', label: '情境模擬', icon: FlaskConical },
  { id: 'data', label: '家庭資料', icon: Database },
  { id: 'retirementSystems', label: '退休制度', icon: Scale },
  { id: 'portfolio', label: '投資組合', icon: PieChart },
  { id: 'market', label: '行情更新', icon: RefreshCw },
  { id: 'settings', label: '預測設定', icon: Settings },
  { id: 'backup', label: '資料與備份', icon: ArchiveRestore },
]

export function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [data, setData] = useState<PlannerData | null>(null)
  const [demoData, setDemoData] = useState<PlannerData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [projection, setProjection] = useState<ProjectionResult | null>(null)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const { offlineReady: [offlineReady], needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  useEffect(() => {
    plannerService.load()
      .then(setData)
      .catch(() => setPersistenceError('無法讀取瀏覽器本機資料庫。'))
      .finally(() => setLoaded(true))
  }, [])

  const activeData = demoData ?? data

  useEffect(() => {
    if (!activeData) return
    let active = true
    plannerService.project(activeData)
      .then((nextProjection) => { if (active) setProjection(nextProjection) })
      .catch(() => { if (active) setPersistenceError('無法建立投資與勞退預測，請檢查資產與預測假設。') })
    return () => { active = false }
  }, [activeData])

  async function saveData(next: PlannerData) {
    setProjection(null)
    try {
      const saved = await plannerService.save(next)
      setData(saved)
      setPersistenceError(null)
    } catch (error) {
      setPersistenceError(error instanceof Error && error.message.startsWith('INVALID_') ? '資料欄位或關聯無效，尚未儲存。請檢查輸入。' : '無法寫入瀏覽器本機資料庫。請立即匯出備份。')
    }
  }

  async function saveActiveData(next: PlannerData) {
    if (demoData) { setDemoData(next); return }
    await saveData(next)
  }

  const primary = useMemo(
    () => activeData?.members.find((member) => member.id === activeData.household.primaryMemberId),
    [activeData],
  )

  if (!loaded) return <div className="loading-screen" role="status">正在讀取退休規劃資料…</div>

  if (!data && persistenceError) {
    return (
      <main className="recovery-screen">
        <section className="recovery-card" role="alert">
          <p className="eyebrow">本機資料讀取失敗</p>
          <h1>退休規劃資料暫時無法開啟</h1>
          <p>資料仍保留在此瀏覽器中，系統沒有清除或覆寫它。請先關閉其他本站分頁後再重新整理。</p>
          <div className="recovery-actions">
            <button className="button primary" type="button" onClick={() => window.location.reload()}>重新整理</button>
          </div>
        </section>
      </main>
    )
  }

  if (!activeData) {
    return (
      <Onboarding
        onCreate={saveData}
        onEvent={(event) => noopAnalytics.track(event)}
        onLoadDemo={() => { setDemoData(createDemoData(new Date().toLocaleDateString('sv-SE'))); noopAnalytics.track('demo_opened') }}
      />
    )
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳至主要內容</a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><House size={20} aria-hidden="true" /></span>
          <span><strong>安心退休</strong><small>家庭資產規劃</small></span>
        </div>
        <nav aria-label="主要功能">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(item.id)}>
                <Icon size={19} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="privacy-note">
          <strong>本機優先</strong>
          <span>財務資料只儲存在這台裝置的瀏覽器內。</span>
        </div>
      </aside>

      <main className="main-content" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeData.household.name}</p>
            <h1>{navigation.find((item) => item.id === page)?.label}</h1>
          </div>
          <div className="topbar-meta">
            <span>主要規劃人：{primary?.name}</span>
            <span>基準日：{activeData.calculationBaseDate}</span>
          </div>
        </header>

        {persistenceError && <div className="alert error" role="alert">{persistenceError}</div>}
        {demoData && <div className="alert info demo-banner" role="status"><span>目前正在使用展示資料，這些不是你的正式資料。</span><span><button className="button small" type="button" onClick={() => { setDemoData(null); setPage('dashboard') }}>離開展示模式</button>{!data && <button className="button small" type="button" onClick={() => setDemoData(null)}>建立我的規劃</button>}</span></div>}
        {(offlineReady || needRefresh) && (
          <div className="update-toast" role="status">
            <span>{needRefresh ? '有新版可以使用。' : '已可離線使用。'}</span>
            {needRefresh && <button className="button small" onClick={() => updateServiceWorker(true)}>重新載入</button>}
          </div>
        )}

        <Suspense fallback={<div className="panel" role="status">正在載入功能…</div>}>
          {page === 'dashboard' && <Dashboard service={plannerService} data={activeData} systemEstimates={plannerService.retirementSystems(activeData)} portfolio={plannerService.portfolio(activeData)} projection={projection} calculating={projection === null} financialOverview={plannerService.financialOverview(activeData)} onContinueFullPlan={() => setPage('data')} onOpenData={() => setPage('data')} />}
          {page === 'data' && <DataPage data={activeData} summary={plannerService.dashboard(activeData, 'household')} onChange={saveActiveData} />}
          {page === 'settings' && <SettingsPage data={activeData} onChange={saveActiveData} />}
          {page === 'retirementSystems' && <RetirementSystemsPage data={activeData} estimates={plannerService.retirementSystems(activeData)} onChange={saveActiveData} />}
          {page === 'portfolio' && <PortfolioPage data={activeData} result={plannerService.portfolio(activeData)} onChange={saveActiveData} />}
          {page === 'scenarios' && <ScenarioPage data={activeData} service={scenarioService} onChange={saveActiveData} />}
          {page === 'market' && <MarketDataPage data={activeData} service={marketDataService} onChange={saveActiveData} />}
          {page === 'backup' && (
            <BackupPage
              data={activeData}
              onRestore={saveActiveData}
              feedbackUrl={import.meta.env.VITE_FEEDBACK_URL}
              onClear={async () => {
                if (demoData) { setDemoData(null) } else { await plannerService.clear(); setData(null) }
                setPage('dashboard')
              }}
            />
          )}
        </Suspense>
      </main>

      <MobileNavigation items={navigation} page={page} onNavigate={setPage} />
    </div>
  )
}
