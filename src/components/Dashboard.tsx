import { useMemo } from 'react'
import { AlertTriangle, Landmark, PieChart, TrendingUp, WalletCards } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PlannerData } from '../application/planner-data'
import type { DashboardScope, DashboardViewModel, RetirementSystemView } from '../application/planner-service'
import type { ProjectionResult } from '../domain/models'
import type { RebalancingResult } from '../domain/rebalancing-engine'
import { CalculationHelp } from './CalculationHelp'

interface Props { data: PlannerData; viewModel: DashboardViewModel; systemEstimates: RetirementSystemView[]; portfolio: RebalancingResult | null; onScopeChange: (scope: DashboardScope) => void; projection: ProjectionResult | null; calculating: boolean }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const compactCurrency = (value: number) => new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const allocationLabels: Record<string, string> = { stock: '股票', bond: '債券', moneyMarket: '貨幣市場', cash: '現金', other: '其他' }
const scenarioColors = { conservative: '#8a6a24', balanced: '#1c6b4a', optimistic: '#3f6fa8' }

export function Dashboard({ data, viewModel, systemEstimates, portfolio, onScopeChange, projection, calculating }: Props) {
  const partner = data.members.find((member) => member.role === 'partner')
  const chartData = useMemo(() => projection?.horizons.map((years, index) => ({
    years: `${years} 年後`,
    ...Object.fromEntries(projection.scenarios.map((scenario) => [scenario.label, Number(scenario.milestones[index]?.totalAssetsReal ?? 0)])),
  })) ?? [], [projection])
  const balanced = projection?.scenarios.find((scenario) => scenario.id === 'balanced')
  const lastMarketUpdate = (data.marketDataStamps ?? []).filter((item) => item.status !== 'failed').at(-1)

  return <div className="page-stack">
    <section className="scope-bar" aria-label="查看範圍"><span>資產摘要範圍</span>{(['household', 'primary', ...(partner ? ['partner'] : [])] as DashboardScope[]).map((item) => <button key={item} className={viewModel.scope === item ? 'active' : ''} onClick={() => onScopeChange(item)}>{item === 'household' ? '家庭' : item === 'primary' ? '主要規劃人' : '伴侶'}</button>)}</section>

    <section className="hero-result projection-hero">
      <div><p className="eyebrow light">投資與退休資產預測</p><h2>{calculating ? '正在建立未來資產預測…' : balanced?.milestones.at(-1) ? `35 年後約 ${currency.format(Number(balanced.milestones.at(-1)!.totalAssetsReal))}` : '完成投資資料後即可開始預測'}</h2><p>穩健情境・今天購買力。退休時間與資金用途由你自行判斷。</p></div><TrendingUp size={52} strokeWidth={1.5} aria-hidden="true" />
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h3><PieChart size={20} /><CalculationHelp label="目前投資組合配置" topic="currentAllocation" /></h3><p>以投資組合中選取的資產為範圍；ETF 與基金依實際投資內容分類。</p></div><small>{lastMarketUpdate ? `行情 ${new Date(lastMarketUpdate.completedAt).toLocaleDateString('zh-TW')}` : '使用目前登錄市值'}</small></div>
      {portfolio?.allocations.length ? <div className="allocation-summary">{portfolio.allocations.map((item) => <article key={item.assetClass}><div><span>{allocationLabels[item.assetClass] ?? item.assetClass}</span><strong>{(Number(item.currentWeight) * 100).toFixed(1)}%</strong></div><div className="allocation-bar" aria-label={`${allocationLabels[item.assetClass] ?? item.assetClass} ${(Number(item.currentWeight) * 100).toFixed(1)}%`}><span style={{ width: `${Number(item.currentWeight) * 100}%` }} /></div><small>{currency.format(Number(item.valueTwd))}</small></article>)}</div> : <p className="muted">請至投資組合選取要納入分析與預測的資產。</p>}
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h3><TrendingUp size={20} /><CalculationHelp label="固定期間資產預估" topic="forecastScenarios" /></h3><p><CalculationHelp label="名目金額" topic="nominalValue" />是未來帳面金額；<CalculationHelp label="今天購買力" topic="purchasingPower" />已依年通膨率 {(Number(projection?.inflationRate ?? 0) * 100).toFixed(1)}% 換算。</p></div><small>{projection?.contractVersion ?? 'projection-contract-v0.2'}</small></div>
      {projection ? <div className="projection-table-wrap"><table className="projection-table"><thead><tr><th>期間</th>{projection.scenarios.map((scenario) => <th key={scenario.id}>{scenario.label}<small>報酬調整 {Number(scenario.returnAdjustment) >= 0 ? '+' : ''}{(Number(scenario.returnAdjustment) * 100).toFixed(1)}%</small></th>)}</tr></thead><tbody>{projection.horizons.map((years, index) => <tr key={years}><th>{years} 年後<small>{projection.scenarios[0].milestones[index]?.month}</small></th>{projection.scenarios.map((scenario) => { const item = scenario.milestones[index]; return <td key={scenario.id}><strong>{currency.format(Number(item.totalAssetsNominal))}</strong><small>今天購買力 {currency.format(Number(item.totalAssetsReal))}</small></td> })}</tr>)}</tbody></table></div> : <p role="status">正在計算預測…</p>}
    </section>

    <section className="content-grid">
      <article className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="今天購買力趨勢" topic="purchasingPower" /></h3><p>三條線使用相同本金與投入計畫，只調整年化報酬假設。</p></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="years" /><YAxis tickFormatter={compactCurrency} width={58} /><Tooltip formatter={(value) => currency.format(Number(value))} /><Legend />{projection?.scenarios.map((scenario) => <Line key={scenario.id} type="monotone" dataKey={scenario.label} stroke={scenarioColors[scenario.id]} strokeWidth={3} dot={{ r: 3 }} />)}</LineChart></ResponsiveContainer></div></article>
      <article className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="穩健情境組成" topic="investmentAssets" /></h3><p>投資資產與勞退專戶分開列示。</p></div></div><div className="milestone-grid projection-breakdown">{balanced?.milestones.map((item) => <article key={item.yearsFromNow}><span>{item.yearsFromNow} 年後</span><strong>{currency.format(Number(item.totalAssetsNominal))}</strong><small>投資 {currency.format(Number(item.investmentAssetsNominal))}</small><small>勞退 {currency.format(Number(item.laborPensionAssetsNominal))}</small></article>)}</div></article>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h3><Landmark size={20} /><CalculationHelp label="勞保年金" topic="laborInsurance" />與<CalculationHelp label="勞退專戶" topic="laborPension" /></h3><p>勞保是未來收入，不加入資產總額；勞退專戶列入上方資產預測。</p></div><small>估算，實際資格與金額以主管機關核定為準</small></div>
      <div className="labor-system-grid">{systemEstimates.map((view) => <article key={view.memberId}><h4>{view.memberName}</h4><div><span>勞保年金</span><strong>{view.estimate?.laborInsurance.monthlyBenefitRealTwd ? `${currency.format(Number(view.estimate.laborInsurance.monthlyBenefitRealTwd))}／月` : '資料未提供'}</strong><small>{view.estimate ? `${view.estimate.laborInsurance.claimMonth} 請領（${view.estimate.laborInsurance.statutoryClaimAge} 歲為法定年齡）` : '請至退休制度補齊'}</small></div><div><span>勞退專戶</span><strong>{view.estimate?.laborPension.projectedAccountBalanceTwd ? currency.format(Number(view.estimate.laborPension.projectedAccountBalanceTwd)) : '資料未提供'}</strong><small>{view.estimate ? `${view.estimate.laborPension.claimMonth} 預估請領` : '請至退休制度補齊'}</small></div></article>)}</div>
    </section>

    <section className="panel secondary-summary"><div className="panel-heading"><div><h3><WalletCards size={20} />完整資產摘要</h3><p>保留完整個人／家庭資產管理，摘要不作為首頁主要判斷。</p></div></div><div className="cashflow-grid"><article><CalculationHelp label="總資產" topic="totalAssets" /><strong>{currency.format(Number(viewModel.totalAssetsTwd))}</strong></article><article><CalculationHelp label="總負債" topic="totalLiabilities" /><strong>{currency.format(Number(viewModel.totalLiabilitiesTwd))}</strong></article><article><CalculationHelp label="淨資產" topic="netWorth" /><strong>{currency.format(Number(viewModel.netWorthTwd))}</strong></article></div></section>

    {projection?.warnings.map((warning) => <div className="message warning" key={`${warning.code}-${warning.entityId ?? ''}`}><AlertTriangle size={18} /><span>{warning.message}</span></div>)}
  </div>
}
