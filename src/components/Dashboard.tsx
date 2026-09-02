import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleDollarSign, Clock3, Info, WalletCards } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PlannerData } from '../application/planner-data'
import type { DashboardScope, DashboardViewModel, RetirementSystemView } from '../application/planner-service'
import type { CalculationResult, ProjectionResult } from '../domain/models'
import type { RebalancingResult } from '../domain/rebalancing-engine'

interface Props { data: PlannerData; viewModel: DashboardViewModel; systemEstimates: RetirementSystemView[]; portfolio: RebalancingResult | null; onScopeChange: (scope: DashboardScope) => void; result: CalculationResult | null; projection: ProjectionResult | null; calculating: boolean }

const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })

export function Dashboard({ data, viewModel, systemEstimates, portfolio, onScopeChange, result, projection, calculating }: Props) {
  const scope = viewModel.scope
  const [moneyMode, setMoneyMode] = useState<'real' | 'nominal'>('real')
  const partner = data.members.find((member) => member.role === 'partner')
  const chartData = useMemo(() => result?.monthlyTimeline
    .filter((_, index) => index % 12 === 0)
    .map((item) => ({ month: item.month, assets: Math.round(Number(moneyMode === 'real' ? item.closingAssetsReal : item.closingAssets)) })) ?? [], [result, moneyMode])
  const retirementAge = result?.retirementAgeInMonths == null
    ? null
    : `${Math.floor(result.retirementAgeInMonths / 12)} 歲 ${result.retirementAgeInMonths % 12} 個月`
  const plannedAssets = projection && (moneyMode === 'real' ? projection.projectedAssetsAtPlannedReal : projection.projectedAssetsAtPlannedNominal)
  const currentFlow = projection?.timeline[0]

  return (
    <div className="page-stack">
      <section className="scope-bar" aria-label="查看範圍">
        <span>查看範圍</span>
        {(['household', 'primary', ...(partner ? ['partner'] : [])] as DashboardScope[]).map((item) => (
          <button key={item} className={scope === item ? 'active' : ''} onClick={() => onScopeChange(item)}>
            {item === 'household' ? '家庭' : item === 'primary' ? '主要規劃人' : '伴侶'}
          </button>
        ))}
      </section>
      <section className="scope-bar" aria-label="金額呈現方式"><span>金額</span><button className={moneyMode === 'real' ? 'active' : ''} onClick={() => setMoneyMode('real')}>今天購買力</button><button className={moneyMode === 'nominal' ? 'active' : ''} onClick={() => setMoneyMode('nominal')}>名目金額</button></section>

      {scope !== 'household' && (
        <div className="alert info"><Info size={18} aria-hidden="true" />個人檢視顯示該成員的資產持分；最早退休月份仍依主要規劃人的家庭退休計畫計算。</div>
      )}

      <div className="alert info"><Info size={18} aria-hidden="true" />退休結果固定代表「{viewModel.retirementResultScopeLabel}」。</div>

      <section className="hero-result">
        <div>
          <p className="eyebrow light">依目前資料與基準情境</p>
          {calculating ? <h2>正在建立月份時間軸…</h2> : result?.status === 'success' ? (
            <><h2>最早約在 <strong>{retirementAge}</strong> 可以退休</h2><p>退休月份 {result.earliestRetirementMonth}，結果以今天購買力呈現。</p></>
          ) : result?.status === 'notAchievableWithinHorizon' ? (
            <><h2>目前條件在規劃期間內尚未達標</h2><p>可調整每月投入、退休生活費或預測假設後再比較。</p></>
          ) : (
            <><h2>完成必要資料後即可計算</h2><p>請先加入退休資產並檢查錯誤提示。</p></>
          )}
        </div>
        <Clock3 size={52} strokeWidth={1.5} aria-hidden="true" />
      </section>

      <section className="metric-grid">
        <article className="metric-card"><span className="metric-icon"><WalletCards size={21} /></span><p>目前查看資產</p><strong>{currency.format(Number(viewModel.totalAssetsTwd))}</strong><small>{viewModel.assetCount} 筆有效資產</small></article>
        <article className="metric-card"><span className="metric-icon"><CircleDollarSign size={21} /></span><p>目前負債</p><strong>{currency.format(Number(viewModel.totalLiabilitiesTwd))}</strong><small>{viewModel.liabilityCount} 筆有效負債</small></article>
        <article className="metric-card"><span className="metric-icon"><CheckCircle2 size={21} /></span><p>目前淨資產</p><strong>{currency.format(Number(viewModel.netWorthTwd))}</strong><small>{viewModel.missingDataCount > 0 ? `${viewModel.missingDataCount} 項資料未提供` : '資料完整'}</small></article>
        <article className="metric-card"><span className="metric-icon"><CircleDollarSign size={21} /></span><p>退休目標資產</p><strong>{projection?.retirementTargetAssetsReal ? currency.format(Number(projection.retirementTargetAssetsReal)) : '—'}</strong><small>預計退休月份 · 今天購買力</small></article>
        <article className="metric-card"><span className="metric-icon"><CheckCircle2 size={21} /></span><p>退休準備率</p><strong>{projection?.readinessStatus === 'achieved' && projection.readinessRate === null ? '已達標' : projection?.readinessRate ? `${projection.readinessRate}%` : '—'}</strong><small>{projection?.plannedRetirementMonth ?? '需設定預計退休月份'}</small></article>
        <article className="metric-card"><span className="metric-icon"><WalletCards size={21} /></span><p>預計退休時資產</p><strong>{plannedAssets ? currency.format(Number(plannedAssets)) : '—'}</strong><small>{moneyMode === 'real' ? '今天購買力' : '名目金額'}</small></article>
        <article className="metric-card"><span className="metric-icon"><CircleDollarSign size={21} /></span><p>退休時預估資產</p><strong>{result?.retirementAssetsAtRetirement ? currency.format(Number(result.retirementAssetsAtRetirement)) : '—'}</strong><small>名目金額</small></article>
        <article className="metric-card"><span className="metric-icon"><CheckCircle2 size={21} /></span><p>規劃終點剩餘</p><strong>{result?.endingAssetsReal ? currency.format(Number(result.endingAssetsReal)) : '—'}</strong><small>今天購買力</small></article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h3>投資組合與再平衡</h3><p>家庭可投資資產的目前配置與目標偏離。</p></div><small>{portfolio?.status === 'balanced' ? '配置正常' : portfolio?.status === 'reviewNeeded' ? '建議檢視' : '尚未設定'}</small></div>
        {portfolio?.allocations.length ? <div className="cashflow-grid">{portfolio.allocations.map((item) => <article key={item.assetClass}><span>{item.assetClass}</span><strong>{(Number(item.currentWeight) * 100).toFixed(1)}%</strong><small>目標 {(Number(item.targetWeight) * 100).toFixed(1)}%</small></article>)}</div> : <p className="muted">請至投資組合設定納入範圍與目標。</p>}
        {portfolio?.warnings.map((warning) => <div className="message warning" key={warning}><AlertTriangle size={18} />{warning}</div>)}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h3>勞保／勞退估算</h3><p>各成員分開計算後，以外部收入事件併入同一家庭時間軸。</p></div><small>規則 tw-labor-rules-2026-08-20</small></div>
        <div className="retirement-system-results">{systemEstimates.map((view) => <article key={view.memberId}><span>{view.memberName}</span><strong>{view.estimate ? currency.format(Number(view.estimate.laborInsurance.monthlyBenefitRealTwd ?? 0) + Number(view.estimate.laborPension.monthlyBenefitRealTwd ?? 0)) : '資料未提供'}</strong><small>{view.estimate ? '每月合計估算 · 今天購買力' : view.status === 'notApplicable' ? '不適用' : '請至退休制度補齊'}</small></article>)}</div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h3>家庭每月現金流基線</h3><p>收入扣除一般支出、負債還款與明確投入；投入只計入退休資產一次。</p></div><small>{currentFlow?.month ?? '—'}</small></div>
        <div className="cashflow-grid">
          <article><span>收入</span><strong>{currentFlow ? currency.format(Number(currentFlow.income)) : '—'}</strong></article>
          <article><span>一般支出</span><strong>{currentFlow ? currency.format(Number(currentFlow.generalExpenses)) : '—'}</strong></article>
          <article><span>負債還款</span><strong>{currentFlow ? currency.format(Number(currentFlow.liabilityPayments)) : '—'}</strong></article>
          <article><span>退休制度收入</span><strong>{currentFlow ? currency.format(Number(currentFlow.retirementIncomeReal)) : '—'}</strong></article>
          <article><span>明確投入</span><strong>{currentFlow ? currency.format(Number(currentFlow.explicitContributions)) : '—'}</strong></article>
          <article><span>未配置現金流</span><strong>{currentFlow ? currency.format(Number(currentFlow.unallocatedCashFlow)) : '—'}</strong></article>
          <article><span>負債餘額</span><strong>{currentFlow ? currency.format(Number(currentFlow.liabilityBalance)) : '—'}</strong></article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h3>指定年齡資產節點</h3><p>以固定預計退休月份情境顯示；超出規劃範圍時以「—」表示。</p></div><small>資料更新：{new Date(data.updatedAt).toLocaleString('zh-TW')}</small></div>
        <div className="milestone-grid">{projection?.milestones.map((item) => <article key={item.age}><span>{item.age} 歲</span><strong>{item.assetsReal ? currency.format(Number(moneyMode === 'real' ? item.assetsReal : item.assetsNominal)) : '—'}</strong><small>{item.month}</small></article>)}</div>
      </section>

      <section className="content-grid">
        <article className="panel chart-panel">
          <div className="panel-heading"><div><h3>家庭退休資產時間線</h3><p>每年擷取一個節點，金額為今天購買力。</p></div></div>
          {chartData.length > 0 ? (
            <div className="chart-wrap" aria-label="退休資產時間線圖">
              <p className="visually-hidden">退休資產時間線共有 {chartData.length} 個年度節點，從 {chartData[0]?.month} 的 {currency.format(chartData[0]?.assets ?? 0)}，到 {chartData.at(-1)?.month} 的 {currency.format(chartData.at(-1)?.assets ?? 0)}。</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#dfe7e1" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 10000)}萬`} width={60} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => currency.format(Number(value))} labelFormatter={(label) => `${label}`} />
                  <Line type="monotone" dataKey="assets" name={moneyMode === 'real' ? '實質資產' : '名目資產'} stroke="#1c6b4a" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="empty-chart">尚無可顯示的時間軸</div>}
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h3>本次計算提醒</h3><p>提醒不會阻止有效資料參與計算。</p></div></div>
          <div className="message-list">
            {result?.errors.map((message) => <div className="message error" key={message.code + message.entityId}><AlertTriangle size={18} /> <span>{message.message}</span></div>)}
            {result?.warnings.map((message) => <div className="message warning" key={message.code + message.entityId}><AlertTriangle size={18} /> <span>{message.message}</span></div>)}
            {projection?.warnings.map((message) => <div className="message warning" key={`projection-${message.code}-${message.entityId ?? ''}`}><AlertTriangle size={18} /> <span>{message.message}</span></div>)}
            {!result && <p className="muted">尚未完成計算。</p>}
          </div>
          {result && <div className="trace-summary"><span>納入 {result.includedDataSummary.assetIds.length} 筆資產</span><span>排除 {result.excludedDataSummary.assets.length} 筆資產</span><span>契約 {result.contractVersion}</span>{projection && <span>{projection.contractVersion}</span>}</div>}
        </article>
      </section>
    </div>
  )
}
