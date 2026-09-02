import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, CircleDollarSign, Clock3, Info, WalletCards } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PlannerData } from '../application/planner-data'
import type { DashboardScope, DashboardViewModel } from '../application/planner-service'
import type { CalculationResult } from '../domain/models'

interface Props { data: PlannerData; viewModel: DashboardViewModel; onScopeChange: (scope: DashboardScope) => void; result: CalculationResult | null; calculating: boolean }

const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })

export function Dashboard({ data, viewModel, onScopeChange, result, calculating }: Props) {
  const scope = viewModel.scope
  const partner = data.members.find((member) => member.role === 'partner')
  const chartData = useMemo(() => result?.monthlyTimeline
    .filter((_, index) => index % 12 === 0)
    .map((item) => ({ month: item.month, assets: Math.round(Number(item.closingAssetsReal)) })) ?? [], [result])
  const retirementAge = result?.retirementAgeInMonths == null
    ? null
    : `${Math.floor(result.retirementAgeInMonths / 12)} 歲 ${result.retirementAgeInMonths % 12} 個月`

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
        <article className="metric-card"><span className="metric-icon"><CircleDollarSign size={21} /></span><p>退休時預估資產</p><strong>{result?.retirementAssetsAtRetirement ? currency.format(Number(result.retirementAssetsAtRetirement)) : '—'}</strong><small>名目金額</small></article>
        <article className="metric-card"><span className="metric-icon"><CheckCircle2 size={21} /></span><p>規劃終點剩餘</p><strong>{result?.endingAssetsReal ? currency.format(Number(result.endingAssetsReal)) : '—'}</strong><small>今天購買力</small></article>
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
                  <Line type="monotone" dataKey="assets" name="實質資產" stroke="#1c6b4a" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
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
            {!result && <p className="muted">尚未完成計算。</p>}
          </div>
          {result && <div className="trace-summary"><span>納入 {result.includedDataSummary.assetIds.length} 筆資產</span><span>排除 {result.excludedDataSummary.assets.length} 筆資產</span><span>契約 {result.contractVersion}</span></div>}
        </article>
      </section>
    </div>
  )
}
