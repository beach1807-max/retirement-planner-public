import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Landmark, PieChart, TrendingUp } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PlannerData } from '../application/planner-data'
import type { PlannerService, ProjectionOptions, RetirementSystemView } from '../application/planner-service'
import type { ProjectionResult } from '../domain/models'
import type { RebalancingResult } from '../domain/rebalancing-engine'
import { CalculationHelp } from './CalculationHelp'
import { PlanSummary } from './PlanSummary'

interface Props { service: PlannerService; data: PlannerData; systemEstimates: RetirementSystemView[]; portfolio: RebalancingResult | null; projection: ProjectionResult | null; calculating: boolean; onContinueFullPlan: () => void }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const compactCurrency = (value: number) => new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const allocationLabels: Record<string, string> = { stock: '股票', bond: '債券', moneyMarket: '貨幣市場', cash: '現金', other: '其他' }
const scenarioColors = { conservative: '#8a6a24', balanced: '#1c6b4a', optimistic: '#3f6fa8', custom: '#8057a3' }

export function Dashboard({ data, systemEstimates, portfolio, projection: initialProjection, calculating, service, onContinueFullPlan }: Props) {
  const [years, setYears] = useState(10)
  const [showAll, setShowAll] = useState(false)
  const [scope, setScope] = useState('all')
  const [custom, setCustom] = useState(false)
  const [adjustment, setAdjustment] = useState('1')
  const [adjustPension, setAdjustPension] = useState(false)
  const [filtered, setFiltered] = useState<{ data: PlannerData; options: ProjectionOptions; result: ProjectionResult } | null>(null)
  const [error, setError] = useState('')
  const options = useMemo<ProjectionOptions>(() => ({
    scope: scope === 'all' ? undefined : { kind: scope.startsWith('asset:') ? 'asset' : 'class', value: scope.slice(scope.indexOf(':') + 1) },
    customScenario: custom ? { returnAdjustment: String(Number(adjustment) / 100), adjustLaborPension: adjustPension } : undefined,
  }), [scope, custom, adjustment, adjustPension])
  useEffect(() => {
    let active = true
    if (custom && (adjustment.trim() === '' || !Number.isFinite(Number(adjustment)) || Math.abs(Number(adjustment)) > 100)) return
    service.project(data, options).then((result) => { if (active) { setFiltered({ data, options, result }); setError('') } }).catch(() => { if (active) setError('無法計算，請確認報酬調整與資產資料。') })
    return () => { active = false }
  }, [data, options, service, custom, adjustment])
  const invalidAdjustment = custom && (adjustment.trim() === '' || !Number.isFinite(Number(adjustment)) || Math.abs(Number(adjustment)) > 100)
  const projection = invalidAdjustment ? null : filtered?.data === data && filtered.options === options ? filtered.result : scope === 'all' && !custom ? initialProjection : null
  const visibleYears = projection?.horizons.filter((value) => showAll || value === years) ?? []
  const chartData = useMemo(() => projection?.horizons.map((years) => ({
    years: `${years} 年後`,
    ...Object.fromEntries(projection.scenarios.map((scenario) => [scenario.id === 'optimistic' ? '比較樂觀' : scenario.label, Number(scenario.milestones.find((item) => item.yearsFromNow === years)?.totalAssetsReal ?? 0)])),
  })) ?? [], [projection])
  const balanced = projection?.scenarios.find((scenario) => scenario.id === 'balanced')
  const lastMarketUpdate = (data.marketDataStamps ?? []).filter((item) => item.status !== 'failed').at(-1)

  return <div className="page-stack">

    <section className="panel"><h2>看懂配置、未來金額與今天的購買力</h2><p className="muted">先在家庭資料記錄資產，再到投資組合選取預測範圍。下方可選擇未來期間、資產範圍與報酬情境，退休時間由你自己決定。</p>{calculating && <p role="status">正在建立未來資產預測…</p>}</section>

    <PlanSummary portfolio={portfolio} projection={projection} years={years} />

    <section className="panel">
      <div className="panel-heading"><div><h3><PieChart size={20} /><CalculationHelp label="我現在的投資怎麼分配？" topic="currentAllocation" /></h3><p>各類金額除以投資組合總額，就是目前占比。ETF 與基金依投資內容分類。</p></div><small>{lastMarketUpdate ? `行情 ${new Date(lastMarketUpdate.completedAt).toLocaleDateString('zh-TW')}` : '使用目前登錄市值'}</small></div>
      <p className="muted">納入資產：{data.assets.filter((asset) => data.portfolios[0]?.assetIds.includes(asset.id)).map((asset) => asset.name).join('、') || '尚未選取，請至投資組合設定'}</p>
      {portfolio?.allocations.length ? <div className="allocation-summary">{portfolio.allocations.map((item) => <article key={item.assetClass}><div><span>{allocationLabels[item.assetClass] ?? item.assetClass}</span><strong>{(Number(item.currentWeight) * 100).toFixed(1)}%</strong></div><div className="allocation-bar" aria-label={`${allocationLabels[item.assetClass] ?? item.assetClass} ${(Number(item.currentWeight) * 100).toFixed(1)}%`}><span style={{ width: `${Number(item.currentWeight) * 100}%` }} /></div><small>{currency.format(Number(item.valueTwd))}</small></article>)}</div> : <p className="muted">請至投資組合選取要納入分析與預測的資產。</p>}
    </section>



    <section className="panel">
      <div className="panel-heading"><div><h3><TrendingUp size={20} /><CalculationHelp label="未來可能累積多少？" topic="forecastScenarios" /></h3><p><CalculationHelp label="名目金額" topic="nominalValue" />是未來帳面金額；<CalculationHelp label="今天購買力" topic="purchasingPower" />已依年通膨率 {(Number(projection?.inflationRate ?? 0) * 100).toFixed(1)}% 換算。</p></div></div>
      <div className="form-grid three">
        <label>查看時間<select value={years} onChange={(event) => setYears(Number(event.target.value))}>{[10,15,20,25,30,35].map((value) => <option key={value} value={value}>{value} 年後</option>)}</select></label>
        <label>查看範圍<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">整體投資組合與勞退</option><optgroup label="依資產類別">{Object.entries(allocationLabels).map(([value, label]) => <option key={value} value={'class:' + value}>{label}</option>)}</optgroup><optgroup label="單筆資產">{data.assets.filter((asset) => data.portfolios[0]?.assetIds.includes(asset.id)).map((asset) => <option key={asset.id} value={'asset:' + asset.id}>{asset.name}</option>)}</optgroup></select></label>
        <label className="checkbox-row"><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />查看所有期間</label>
      </div>
      <label className="checkbox-row"><input type="checkbox" checked={custom} onChange={(event) => setCustom(event.target.checked)} />加入自訂情境</label>
      {custom && <div className="form-grid two"><label>自訂報酬調整（百分點）<input type="number" min="-100" max="100" step="0.1" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /><small>例如 +1：穩健 6% 改用 7%（包含已自行設定情境的資產）。最低有效年報酬以 -99% 計算。</small></label><label className="checkbox-row"><input type="checkbox" checked={adjustPension} onChange={(event) => setAdjustPension(event.target.checked)} />同時調整勞退報酬</label></div>}
      {invalidAdjustment && <p role="alert">請輸入 -100 至 100 之間的報酬調整百分點。</p>}
      {error && <p role="alert">{error}</p>}
      {scope !== 'all' && <p className="muted">此範圍只包含選取的資產與明確投向它的每月投入；未指定資產的投入及勞退只列在整體預測。下方配置占比仍以整體投資組合為分母。</p>}
      <p className="muted">整體預估包含投資組合、已建立的每月投入與勞退；類別／單筆只計對應資產與投入。勞保收入另列。尚未扣除負債、生活費或一次性支出。各情境是報酬假設比較，不代表發生機率。</p>
      {projection ? <div className="projection-table-wrap"><table className="projection-table"><thead><tr><th>期間</th>{projection.scenarios.map((scenario) => <th key={scenario.id}>{scenario.id === 'optimistic' ? '比較樂觀' : scenario.label}<small>{scenario.id !== 'custom' ? '依各資產情境設定；未自設者 ' : '各資產穩健報酬再調整 '}{Number(scenario.returnAdjustment) >= 0 ? '+' : ''}{(Number(scenario.returnAdjustment) * 100).toFixed(1)} 個百分點</small></th>)}</tr></thead><tbody>{visibleYears.map((years) => <tr key={years}><th>{years} 年後<small>{projection.scenarios[0].milestones.find((item) => item.yearsFromNow === years)?.month}</small></th>{projection.scenarios.map((scenario) => { const item = scenario.milestones.find((item) => item.yearsFromNow === years)!; return <td key={scenario.id} data-scenario={scenario.id === 'optimistic' ? '比較樂觀' : scenario.label}><strong>預估合計 {currency.format(Number(item.totalAssetsNominal))}</strong><small>投資與投入 {currency.format(Number(item.investmentAssetsNominal))}</small><small>勞退累積／請領時金額 {currency.format(Number(item.laborPensionAssetsNominal))}</small><small>今天購買力 {currency.format(Number(item.totalAssetsReal))}</small></td> })}</tr>)}</tbody></table></div> : !invalidAdjustment && !error && <p role="status">正在計算預測…</p>}
    </section>

    <section className="content-grid">
      <article className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="相當於今天多少錢？" topic="purchasingPower" /></h3><p>固定顯示 10～35 年的購買力趨勢，依上方資產範圍與情境更新；不受單一期間選單影響。</p></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="years" /><YAxis tickFormatter={compactCurrency} width={76} /><Tooltip formatter={(value) => currency.format(Number(value))} /><Legend />{projection?.scenarios.map((scenario) => <Line key={scenario.id} type="monotone" dataKey={scenario.id === 'optimistic' ? '比較樂觀' : scenario.label} stroke={scenarioColors[scenario.id]} strokeWidth={3} dot={{ r: 3 }} />)}</LineChart></ResponsiveContainer></div></article>
      <article className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="穩健情境組成" topic="investmentAssets" /></h3><p>投資資產與勞退專戶分開列示。</p></div></div><div className="milestone-grid projection-breakdown">{balanced?.milestones.filter((item) => showAll || item.yearsFromNow === years).map((item) => <article key={item.yearsFromNow}><span>{item.yearsFromNow} 年後</span><strong>{currency.format(Number(item.totalAssetsNominal))}</strong><small>投資 {currency.format(Number(item.investmentAssetsNominal))}</small><small>勞退 {currency.format(Number(item.laborPensionAssetsNominal))}</small></article>)}</div></article>
    </section>

    {data.incomes.length === 0 && data.expenses.length === 0 && data.retirementSystems.length === 0 && <section className="panel"><h3>如果我要做完整退休規劃</h3><p>目前已完成資產預測。若要估算退休時間，可繼續補上收入、支出、勞保與勞退。</p><button className="button secondary" type="button" onClick={onContinueFullPlan}>繼續完成退休規劃</button></section>}

    <section className="panel">
      <div className="panel-heading"><div><h3><Landmark size={20} /><CalculationHelp label="勞保年金" topic="laborInsurance" />與<CalculationHelp label="勞退專戶" topic="laborPension" /></h3><p>勞保固定月領；勞退依退休制度頁選擇一次領或月領。整體預測的勞退在請領後保留請領時點金額，並非剩餘專戶餘額；月領收入不再重複加總。</p></div><small>估算，實際資格與金額以主管機關核定為準</small></div>
      <div className="labor-system-grid">{systemEstimates.map((view) => <article key={view.memberId}><h4>{view.memberName}</h4><div><span>勞保年金</span><strong>{view.laborInsuranceEnabled && view.estimate?.laborInsurance.monthlyBenefitRealTwd ? `${currency.format(Number(view.estimate.laborInsurance.monthlyBenefitRealTwd))}／月` : '資料未提供'}</strong><small>{view.estimate ? `${view.estimate.laborInsurance.claimMonth} 請領（${view.estimate.laborInsurance.statutoryClaimAge} 歲為法定年齡）` : '請至退休制度補齊'}</small></div><div><span>勞退請領時預估金額</span><strong>{view.laborPensionEnabled && view.estimate?.laborPension.projectedAccountBalanceTwd ? currency.format(Number(view.estimate.laborPension.projectedAccountBalanceTwd)) : '資料未提供'}</strong><small>{view.estimate ? `${view.estimate.laborPension.claimMonth} 預估請領 · ${view.estimate.laborPension.status === 'monthly' ? '月領，首期約 ' + currency.format(Number(view.estimate.laborPension.monthlyBenefitNominalTwd)) + '／月' : '一次領'}` : '請至退休制度補齊'}</small></div></article>)}</div>
    </section>


    {projection?.warnings.map((warning) => <div className="message warning" key={`${warning.code}-${warning.entityId ?? ''}`}><AlertTriangle size={18} /><span>{warning.message}</span></div>)}
  </div>
}
