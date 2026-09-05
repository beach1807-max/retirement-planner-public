import { useMemo } from 'react'
import { AlertTriangle, Landmark, PieChart, TrendingUp } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PlannerData } from '../application/planner-data'
import type { RetirementSystemView } from '../application/planner-service'
import type { ProjectionResult } from '../domain/models'
import type { RebalancingResult } from '../domain/rebalancing-engine'
import { CalculationHelp } from './CalculationHelp'

interface Props { data: PlannerData; systemEstimates: RetirementSystemView[]; portfolio: RebalancingResult | null; projection: ProjectionResult | null; calculating: boolean }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const compactCurrency = (value: number) => new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const allocationLabels: Record<string, string> = { stock: '股票', bond: '債券', moneyMarket: '貨幣市場', cash: '現金', other: '其他' }
const scenarioColors = { conservative: '#8a6a24', balanced: '#1c6b4a', optimistic: '#3f6fa8' }

export function Dashboard({ data, systemEstimates, portfolio, projection, calculating }: Props) {
  const chartData = useMemo(() => projection?.horizons.map((years, index) => ({
    years: `${years} 年後`,
    ...Object.fromEntries(projection.scenarios.map((scenario) => [scenario.id === 'optimistic' ? '比較樂觀' : scenario.label, Number(scenario.milestones[index]?.totalAssetsReal ?? 0)])),
  })) ?? [], [projection])
  const balanced = projection?.scenarios.find((scenario) => scenario.id === 'balanced')
  const lastMarketUpdate = (data.marketDataStamps ?? []).filter((item) => item.status !== 'failed').at(-1)

  return <div className="page-stack">

    <section className="panel"><h2>看懂配置、未來金額與今天的購買力</h2><p className="muted">先在家庭資料記錄資產，再到投資組合選取預測範圍。下方比較六個期間與三種情境，退休時間由你自己決定。</p>{calculating && <p role="status">正在建立未來資產預測…</p>}</section>

    <section className="panel">
      <div className="panel-heading"><div><h3><PieChart size={20} /><CalculationHelp label="我的投資怎麼分配？" topic="currentAllocation" /></h3><p>各類金額除以投資組合總額，就是目前占比。ETF 與基金依投資內容分類。</p></div><small>{lastMarketUpdate ? `行情 ${new Date(lastMarketUpdate.completedAt).toLocaleDateString('zh-TW')}` : '使用目前登錄市值'}</small></div>
      <p className="muted">納入資產：{data.assets.filter((asset) => data.portfolios[0]?.assetIds.includes(asset.id)).map((asset) => asset.name).join("、") || "尚未選取，請至投資組合設定"}</p>
      {portfolio?.allocations.length ? <div className="allocation-summary">{portfolio.allocations.map((item) => <article key={item.assetClass}><div><span>{allocationLabels[item.assetClass] ?? item.assetClass}</span><strong>{(Number(item.currentWeight) * 100).toFixed(1)}%</strong></div><div className="allocation-bar" aria-label={`${allocationLabels[item.assetClass] ?? item.assetClass} ${(Number(item.currentWeight) * 100).toFixed(1)}%`}><span style={{ width: `${Number(item.currentWeight) * 100}%` }} /></div><small>{currency.format(Number(item.valueTwd))}</small></article>)}</div> : <p className="muted">請至投資組合選取要納入分析與預測的資產。</p>}
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h3><TrendingUp size={20} /><CalculationHelp label="未來可能累積多少？" topic="forecastScenarios" /></h3><p><CalculationHelp label="名目金額" topic="nominalValue" />是未來帳面金額；<CalculationHelp label="今天購買力" topic="purchasingPower" />已依年通膨率 {(Number(projection?.inflationRate ?? 0) * 100).toFixed(1)}% 換算。</p></div></div>
      <p className="muted">預估合計包含投資組合、已建立的每月投入與勞退；勞保收入另列。尚未扣除負債、生活費或一次性支出。三種情境是報酬假設比較，不代表發生機率。</p>
      {projection ? <div className="projection-table-wrap"><table className="projection-table"><thead><tr><th>期間</th>{projection.scenarios.map((scenario) => <th key={scenario.id}>{scenario.id === 'optimistic' ? '比較樂觀' : scenario.label}<small>報酬調整 {Number(scenario.returnAdjustment) >= 0 ? '+' : ''}{(Number(scenario.returnAdjustment) * 100).toFixed(1)}%</small></th>)}</tr></thead><tbody>{projection.horizons.map((years, index) => <tr key={years}><th>{years} 年後<small>{projection.scenarios[0].milestones[index]?.month}</small></th>{projection.scenarios.map((scenario) => { const item = scenario.milestones[index]; return <td key={scenario.id} data-scenario={scenario.id === 'optimistic' ? '比較樂觀' : scenario.label}><strong>預估合計 {currency.format(Number(item.totalAssetsNominal))}</strong><small>投資與投入 {currency.format(Number(item.investmentAssetsNominal))}</small><small>勞退 {currency.format(Number(item.laborPensionAssetsNominal))}</small><small>今天購買力 {currency.format(Number(item.totalAssetsReal))}</small></td> })}</tr>)}</tbody></table></div> : <p role="status">正在計算預測…</p>}
    </section>

    <section className="content-grid">
      <article className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="相當於今天多少錢？" topic="purchasingPower" /></h3><p>三條線使用相同本金與投入計畫，只調整年化報酬假設。</p></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="years" /><YAxis tickFormatter={compactCurrency} width={58} /><Tooltip formatter={(value) => currency.format(Number(value))} /><Legend />{projection?.scenarios.map((scenario) => <Line key={scenario.id} type="monotone" dataKey={scenario.id === 'optimistic' ? '比較樂觀' : scenario.label} stroke={scenarioColors[scenario.id]} strokeWidth={3} dot={{ r: 3 }} />)}</LineChart></ResponsiveContainer></div></article>
      <article className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="穩健情境組成" topic="investmentAssets" /></h3><p>投資資產與勞退專戶分開列示。</p></div></div><div className="milestone-grid projection-breakdown">{balanced?.milestones.map((item) => <article key={item.yearsFromNow}><span>{item.yearsFromNow} 年後</span><strong>{currency.format(Number(item.totalAssetsNominal))}</strong><small>投資 {currency.format(Number(item.investmentAssetsNominal))}</small><small>勞退 {currency.format(Number(item.laborPensionAssetsNominal))}</small></article>)}</div></article>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h3><Landmark size={20} /><CalculationHelp label="勞保年金" topic="laborInsurance" />與<CalculationHelp label="勞退專戶" topic="laborPension" /></h3><p>勞保是未來收入，不加入資產總額；勞退專戶列入上方資產預測。</p></div><small>估算，實際資格與金額以主管機關核定為準</small></div>
      <div className="labor-system-grid">{systemEstimates.map((view) => <article key={view.memberId}><h4>{view.memberName}</h4><div><span>勞保年金</span><strong>{view.estimate?.laborInsurance.monthlyBenefitRealTwd ? `${currency.format(Number(view.estimate.laborInsurance.monthlyBenefitRealTwd))}／月` : '資料未提供'}</strong><small>{view.estimate ? `${view.estimate.laborInsurance.claimMonth} 請領（${view.estimate.laborInsurance.statutoryClaimAge} 歲為法定年齡）` : '請至退休制度補齊'}</small></div><div><span>勞退專戶</span><strong>{view.estimate?.laborPension.projectedAccountBalanceTwd ? currency.format(Number(view.estimate.laborPension.projectedAccountBalanceTwd)) : '資料未提供'}</strong><small>{view.estimate ? `${view.estimate.laborPension.claimMonth} 預估請領` : '請至退休制度補齊'}</small></div></article>)}</div>
    </section>


    {projection?.warnings.map((warning) => <div className="message warning" key={`${warning.code}-${warning.entityId ?? ''}`}><AlertTriangle size={18} /><span>{warning.message}</span></div>)}
  </div>
}
