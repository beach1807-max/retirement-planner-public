import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ArchiveRestore, ChartNoAxesCombined, Database, FlaskConical, House, PieChart, RefreshCw, Scale, Settings } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { createDemoData, type PlannerData } from './application/planner-data'
import { PlannerService, type DashboardScope } from './application/planner-service'
import { ScenarioService } from './application/scenario-service'
import { MarketDataService } from './application/market-data-service'
import type { CalculationResult, ProjectionResult } from './domain/models'
import { Onboarding } from './components/Onboarding'
import { DexiePlannerRepository } from './infrastructure/dexie-planner-repository'
import { OfficialTaiwanMarketDataProvider } from './infrastructure/market-data-provider'

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
  { id: 'dashboard', label: '退休總覽', icon: ChartNoAxesCombined },
  { id: 'data', label: '家庭資料', icon: Database },
  { id: 'retirementSystems', label: '退休制度', icon: Scale },
  { id: 'portfolio', label: '投資組合', icon: PieChart },
  { id: 'scenarios', label: '情境比較', icon: FlaskConical },
  { id: 'market', label: '行情更新', icon: RefreshCw },
  { id: 'settings', label: '預測設定', icon: Settings },
  { id: 'backup', label: '備份還原', icon: ArchiveRestore },
]

export function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [data, setData] = useState<PlannerData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [projection, setProjection] = useState<ProjectionResult | null>(null)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const [dashboardScope, setDashboardScope] = useState<DashboardScope>('household')
  const { offlineReady: [offlineReady], needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  useEffect(() => {
    plannerService.load()
      .then(setData)
      .catch(() => setPersistenceError('無法讀取瀏覽器本機資料庫。'))
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!data) return
    let active = true
    Promise.all([plannerService.calculate(data), plannerService.project(data)])
      .then(([nextResult, nextProjection]) => { if (active) { setResult(nextResult); setProjection(nextProjection) } })
      .catch(() => { if (active) setPersistenceError('無法建立完整家庭預測，請檢查預計退休月份與財務資料。') })
    return () => { active = false }
  }, [data])

  async function saveData(next: PlannerData) {
    setResult(null)
    setProjection(null)
    try {
      const saved = await plannerService.save(next)
      setData(saved)
      setPersistenceError(null)
    } catch (error) {
      setPersistenceError(error instanceof Error && error.message.startsWith('INVALID_') ? '資料欄位或關聯無效，尚未儲存。請檢查輸入。' : '無法寫入瀏覽器本機資料庫。請立即匯出備份。')
    }
  }

  const primary = useMemo(
    () => data?.members.find((member) => member.id === data.household.primaryMemberId),
    [data],
  )

  if (!loaded) return <div className="loading-screen" role="status">正在讀取退休規劃資料…</div>

  if (!data) {
    return (
      <Onboarding
        onCreate={saveData}
        onLoadDemo={() => saveData(createDemoData(new Date().toLocaleDateString('sv-SE')))}
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
            <p className="eyebrow">{data.household.name}</p>
            <h1>{navigation.find((item) => item.id === page)?.label}</h1>
          </div>
          <div className="topbar-meta">
            <span>主要規劃人：{primary?.name}</span>
            <span>基準日：{data.calculationBaseDate}</span>
          </div>
        </header>

        {persistenceError && <div className="alert error" role="alert">{persistenceError}</div>}
        {(offlineReady || needRefresh) && (
          <div className="update-toast" role="status">
            <span>{needRefresh ? '有新版可以使用。' : '已可離線使用。'}</span>
            {needRefresh && <button className="button small" onClick={() => updateServiceWorker(true)}>重新載入</button>}
          </div>
        )}

        <Suspense fallback={<div className="panel" role="status">正在載入功能…</div>}>
          {page === 'dashboard' && <Dashboard data={data} viewModel={plannerService.dashboard(data, dashboardScope)} systemEstimates={plannerService.retirementSystems(data)} portfolio={plannerService.portfolio(data)} onScopeChange={setDashboardScope} result={result} projection={projection} calculating={result === null || projection === null} />}
          {page === 'data' && <DataPage data={data} onChange={saveData} />}
          {page === 'settings' && <SettingsPage data={data} onChange={saveData} />}
          {page === 'retirementSystems' && <RetirementSystemsPage data={data} estimates={plannerService.retirementSystems(data)} onChange={saveData} />}
          {page === 'portfolio' && <PortfolioPage data={data} result={plannerService.portfolio(data)} onChange={saveData} />}
          {page === 'scenarios' && <ScenarioPage data={data} service={scenarioService} onChange={saveData} />}
          {page === 'market' && <MarketDataPage data={data} service={marketDataService} onChange={saveData} />}
          {page === 'backup' && (
            <BackupPage
              data={data}
              onRestore={saveData}
              onClear={async () => {
                await plannerService.clear()
                setData(null)
                setPage('dashboard')
              }}
            />
          )}
        </Suspense>
      </main>

      <nav className="bottom-nav" aria-label="行動版主要功能">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)} aria-label={item.label}>
              <Icon size={21} aria-hidden="true" />
              <span>{item.label.replace('退休', '')}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
