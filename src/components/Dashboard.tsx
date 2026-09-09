import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Landmark, PieChart, TrendingUp } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PlannerAsset, PlannerData } from '../application/planner-data'
import type { FinancialOverview, PlannerService, ProjectionOptions, RetirementSystemView } from '../application/planner-service'
import { ageAtMonth } from '../domain/date'
import type { ProjectionMilestone, ProjectionResult, ProjectionScenario } from '../domain/models'
import type { RebalancingResult } from '../domain/rebalancing-engine'
import { CalculationHelp } from './CalculationHelp'
import { PlanSummary } from './PlanSummary'

interface Props { service: PlannerService; data: PlannerData; systemEstimates: RetirementSystemView[]; portfolio: RebalancingResult | null; projection: ProjectionResult | null; calculating: boolean; financialOverview: FinancialOverview; onContinueFullPlan: () => void; onOpenData: () => void }
interface TimePoint { key: string; month: string; years?: ProjectionMilestone['yearsFromNow']; target: boolean }

const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const compactCurrency = (value: number) => new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const allocationLabels: Record<string, string> = { stock: '股票', bond: '債券', moneyMarket: '貨幣市場', cash: '現金', other: '其他' }
const scenarioColors = { conservative: '#8a6a24', balanced: '#1c6b4a', optimistic: '#3f6fa8', custom: '#8057a3' }
const scenarioLabels = { conservative: '保守', balanced: '穩健', optimistic: '比較樂觀', custom: '自訂' }
const chartScenarioOrder = ['optimistic', 'balanced', 'conservative', 'custom'] as const

function membersForScope(data: PlannerData, scope: string) {
  const memberIds = new Set<string>()
  const addOwners = (asset: PlannerAsset) => {
    if (asset.ownershipType === 'individual' && asset.ownerMemberId) memberIds.add(asset.ownerMemberId)
    else if (asset.ownershipType === 'joint') asset.owners?.forEach((owner) => memberIds.add(owner.memberId))
    else data.members.filter((member) => member.isActive).forEach((member) => memberIds.add(member.id))
  }
  if (scope.startsWith('asset:')) {
    const asset = data.assets.find((item) => item.id === scope.slice(6))
    if (asset) addOwners(asset)
  } else if (scope.startsWith('class:')) {
    data.assets.filter((asset) => data.portfolios[0]?.assetIds.includes(asset.id) && (asset.allocationClass ?? 'other') === scope.slice(6)).forEach(addOwners)
  } else data.members.filter((member) => member.isActive).forEach((member) => memberIds.add(member.id))
  return data.members.filter((member) => memberIds.has(member.id))
}

function ageLabel(data: PlannerData, scope: string, month: string) {
  const members = membersForScope(data, scope)
  if (members.length === 1) return `${ageAtMonth(members[0].birthDate, month)} 歲`
  return members.map((member) => `${member.name} ${ageAtMonth(member.birthDate, month)} 歲`).join('、')
}

function timePointLabel(point: TimePoint, data: PlannerData, scope: string) {
  const prefix = point.target ? point.years ? `目標退休時／${point.years} 年後` : '目標退休時' : `${point.years} 年後`
  const ages = ageLabel(data, scope, point.month)
  return `${prefix}${ages ? `｜${ages}` : ''}｜${point.month}`
}

function milestoneFor(scenario: ProjectionScenario, point: TimePoint) {
  return point.target ? scenario.targetRetirementMilestone : scenario.milestones.find((item) => item.yearsFromNow === point.years)
}

function rateSummary(rates: string[]) {
  if (rates.length === 0) return '無投資報酬資料'
  const values = rates.map((rate) => `${(Number(rate) * 100).toFixed(1)}%`)
  return values.length === 1 ? `實際年報酬 ${values[0]}` : `實際年報酬 ${values[0]}～${values.at(-1)}`
}

export function Dashboard({ data, systemEstimates, portfolio, projection: initialProjection, calculating, service, financialOverview, onContinueFullPlan, onOpenData }: Props) {
  const [selectedPoint, setSelectedPoint] = useState('10')
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
  const points = useMemo<TimePoint[]>(() => {
    if (!projection) return []
    const fixed = projection.horizons.map((years) => ({ key: String(years), years, month: projection.scenarios[0].milestones.find((item) => item.yearsFromNow === years)!.month, target: false }))
    if (!projection.targetRetirementMonth || !projection.scenarios[0].targetRetirementMilestone) return fixed
    const duplicate = fixed.find((point) => point.month === projection.targetRetirementMonth)
    if (duplicate) return fixed.map((point) => point === duplicate ? { ...point, key: 'retirement', target: true } : point)
    return [...fixed, { key: 'retirement', month: projection.targetRetirementMonth, target: true }].sort((a, b) => a.month.localeCompare(b.month))
  }, [projection])

  const activePoint = points.find((point) => point.key === selectedPoint) ?? points[0]
  const visiblePoints = showAll ? points : activePoint ? [activePoint] : []
  const balanced = projection?.scenarios.find((scenario) => scenario.id === 'balanced')
  const balancedMilestone = balanced && activePoint ? milestoneFor(balanced, activePoint) : undefined
  const chartScenarios = chartScenarioOrder.flatMap((id) => projection?.scenarios.find((scenario) => scenario.id === id) ?? [])
  const chartData = points.map((point) => ({ point: point.target ? '目標退休時' : `${point.years} 年後`, ...Object.fromEntries(chartScenarios.map((scenario) => [scenarioLabels[scenario.id], Number(milestoneFor(scenario, point)?.totalAssetsReal ?? 0)])) }))
  const lastMarketUpdate = data.marketDataStamps.filter((item) => item.status !== 'failed').at(-1)

  return <div className="page-stack">
    {financialOverview.missingFxCurrencies.length > 0 && <p role="alert">缺少 {financialOverview.missingFxCurrencies.join('、')}/TWD 匯率，以下合計尚未包含這些資產。請至行情更新或編輯資產填寫匯率。</p>}

    <section className="panel dashboard-intro"><h2>看懂現在的配置與未來購買力</h2><p className="muted">先選擇想看的資產範圍與時間，接著比較三種報酬情境、退休時間與勞保勞退資格。</p>{calculating && <p role="status">正在建立未來資產預測…</p>}</section>

    <section className="panel forecast-controls" aria-labelledby="forecast-controls-title">
      <div className="panel-heading"><div><h2 id="forecast-controls-title">先選想看的範圍與時間</h2><p>所有摘要、預測表格、圖表與退休制度狀態會一起更新。</p></div></div>
      <div className="form-grid three">
        <label>查看範圍<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">整體投資組合與勞退</option><optgroup label="依資產類別">{Object.entries(allocationLabels).map(([value, label]) => <option key={value} value={`class:${value}`}>{label}</option>)}</optgroup><optgroup label="單筆資產">{data.assets.filter((asset) => data.portfolios[0]?.assetIds.includes(asset.id)).map((asset) => <option key={asset.id} value={`asset:${asset.id}`}>{asset.name}</option>)}</optgroup></select></label>
        <label>查看時間<select value={activePoint?.key ?? selectedPoint} onChange={(event) => setSelectedPoint(event.target.value)}>{points.map((point) => <option key={point.key} value={point.key}>{timePointLabel(point, data, scope)}</option>)}</select></label>
        <label className="checkbox-row"><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />同時查看所有時間點</label>
      </div>
      <details className="scenario-options"><summary>自訂報酬情境（選填）</summary><label className="checkbox-row"><input type="checkbox" checked={custom} onChange={(event) => setCustom(event.target.checked)} />加入自訂情境</label>{custom && <div className="form-grid two"><label>穩健報酬再調整（百分點）<input type="number" min="-100" max="100" step="0.1" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /><small>例如 +1：每項資產的穩健年報酬各增加 1 個百分點。</small></label><label className="checkbox-row"><input type="checkbox" checked={adjustPension} onChange={(event) => setAdjustPension(event.target.checked)} />同時調整勞退報酬</label></div>}</details>
      {invalidAdjustment && <p role="alert">請輸入 -100 至 100 之間的報酬調整百分點。</p>}
      {error && <p role="alert">{error}</p>}
      {scope !== 'all' && <p className="muted">此範圍只包含選取的資產與明確投向它的每月投入；未指定資產的投入及勞退只列在整體預測。</p>}
    </section>

    <PlanSummary portfolio={portfolio} milestone={balancedMilestone} timeLabel={activePoint ? timePointLabel(activePoint, data, scope) : ''} />

    <section className="panel">
      <div className="panel-heading"><div><h3><PieChart size={20} /><CalculationHelp label="我現在的投資怎麼分配？" topic="currentAllocation" /></h3><p>各類金額除以投資組合總額，就是目前占比。ETF 與基金依投資內容分類。</p></div><small>{lastMarketUpdate ? `行情 ${new Date(lastMarketUpdate.completedAt).toLocaleDateString('zh-TW')}` : '使用目前登錄市值'}</small></div>
      <p className="muted">納入資產：{data.assets.filter((asset) => data.portfolios[0]?.assetIds.includes(asset.id)).map((asset) => asset.name).join('、') || '尚未選取，請至投資組合設定'}</p>
      {portfolio?.allocations.length ? <div className="allocation-summary">{portfolio.allocations.map((item) => <article key={item.assetClass}><div><span>{allocationLabels[item.assetClass] ?? item.assetClass}</span><strong>{(Number(item.currentWeight) * 100).toFixed(1)}%</strong></div><div className="allocation-bar" aria-label={`${allocationLabels[item.assetClass] ?? item.assetClass} ${(Number(item.currentWeight) * 100).toFixed(1)}%`}><span style={{ width: `${Number(item.currentWeight) * 100}%` }} /></div><small>{currency.format(Number(item.valueTwd))}</small></article>)}</div> : <p className="muted">請至投資組合選取要納入分析與預測的資產。</p>}
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h3><TrendingUp size={20} /><CalculationHelp label="未來可能累積多少？" topic="forecastScenarios" /></h3><p><CalculationHelp label="名目金額" topic="nominalValue" />是未來帳面金額；<CalculationHelp label="今天購買力" topic="purchasingPower" />已依年通膨率 {(Number(projection?.inflationRate ?? 0) * 100).toFixed(1)}% 換算。</p></div></div>
      <p className="muted">情境報酬依各資產設定，組合內不同時顯示最低至最高範圍。這些是假設比較，不代表發生機率。</p>
      {projection ? <div className="projection-table-wrap"><table className="projection-table"><thead><tr><th>時間點</th>{projection.scenarios.map((scenario) => <th key={scenario.id} className={scenario.id === 'balanced' ? 'baseline-scenario' : undefined}>{scenarioLabels[scenario.id]}<small>{rateSummary(scenario.investmentAnnualReturnRates)}</small>{scenario.laborPensionAnnualReturnRates.length > 0 && <small>勞退 {scenario.laborPensionAnnualReturnRates.map((rate) => `${(Number(rate) * 100).toFixed(1)}%`).join('～')}</small>}</th>)}</tr></thead><tbody>{visiblePoints.map((point) => <tr key={point.key}><th>{timePointLabel(point, data, scope)}</th>{projection.scenarios.map((scenario) => { const item = milestoneFor(scenario, point)!; return <td key={scenario.id} className={scenario.id === 'balanced' ? 'baseline-scenario' : undefined} data-scenario={scenarioLabels[scenario.id]}><strong>名目資產 {currency.format(Number(item.totalAssetsNominal))}</strong><small>投資與投入 {currency.format(Number(item.investmentAssetsNominal))}</small><small>勞退帳面累積價值（請領後固定） {currency.format(Number(item.laborPensionAssetsNominal))}</small><small>今天購買力 {currency.format(Number(item.totalAssetsReal))}</small>{scope === 'all' && systemEstimates.filter((view) => view.laborPensionEnabled && view.status === 'provided').map((view) => { const eligibility = service.retirementEligibility(data, view.memberId, item.month)?.pension; return <small key={view.memberId}>{view.memberName} 勞退：{eligibility?.eligible ? '已達一般請領年齡' : `尚未符合請領條件（一般須滿 ${eligibility?.minimumAge} 歲）`}</small> })}</td> })}</tr>)}</tbody></table></div> : !invalidAdjustment && !error && <p role="status">正在計算預測…</p>}
    </section>

    <section className="content-grid">
      <article className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="相當於今天多少錢？" topic="purchasingPower" /></h3><p>依上方資產範圍顯示固定期間與目標退休時間；圖例依「比較樂觀、穩健、保守」排列，穩健位於中間。</p></div></div><div className="chart-wrap" aria-label="各情境今天購買力趨勢；下方預測表格提供完整數值"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="point" /><YAxis tickFormatter={compactCurrency} width={76} /><Tooltip formatter={(value) => currency.format(Number(value))} /><Legend />{chartScenarios.map((scenario) => <Line key={scenario.id} type="monotone" dataKey={scenarioLabels[scenario.id]} stroke={scenarioColors[scenario.id]} strokeWidth={scenario.id === 'balanced' ? 4 : 2.5} dot={{ r: scenario.id === 'balanced' ? 4 : 3 }} />)}</LineChart></ResponsiveContainer></div></article>
      <article className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="穩健情境組成" topic="investmentAssets" /></h3><p>投資資產與勞退專戶分開列示，使用上方相同時間點。</p></div></div><div className="milestone-grid projection-breakdown">{balanced && visiblePoints.map((point) => { const item = milestoneFor(balanced, point)!; return <article key={point.key}><span>{timePointLabel(point, data, scope)}</span><strong>{currency.format(Number(item.totalAssetsNominal))}</strong><small>投資 {currency.format(Number(item.investmentAssetsNominal))}</small><small>勞退 {currency.format(Number(item.laborPensionAssetsNominal))}</small></article> })}</div></article>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h3><Landmark size={20} /><CalculationHelp label="勞保年金" topic="laborInsurance" />與<CalculationHelp label="勞退專戶" topic="laborPension" /></h3><p>以下依「{activePoint ? timePointLabel(activePoint, data, 'all') : '所選時間'}」判斷一般年齡與年資條件；勞保另須離職退保。帳面累積價值不等於當下可請領金額。</p></div><small>估算，實際資格與金額以主管機關核定為準</small></div>
      <div className="labor-system-grid">{systemEstimates.map((view) => { const eligibility = activePoint ? service.retirementEligibility(data, view.memberId, activePoint.month) : null; return <article key={view.memberId}><h4>{view.memberName}</h4><div><span>勞保年金（設定請領時估算）</span><strong>{view.laborInsuranceEnabled && eligibility && !eligibility.insurance.eligible ? '尚未符合請領條件' : view.laborInsuranceEnabled && view.estimate?.laborInsurance.status !== 'success' && view.status === 'provided' ? '請領設定或年資不符合規則' : view.laborInsuranceEnabled && view.estimate?.laborInsurance.monthlyBenefitRealTwd ? `${currency.format(Number(view.estimate.laborInsurance.monthlyBenefitRealTwd))}／月` : '尚未設定'}</strong><small>{view.estimate ? `${view.estimate.laborInsurance.claimMonth} 設定請領（${view.estimate.laborInsurance.statutoryClaimAge} 歲為法定年齡）` : '請至退休制度完成設定'}</small></div><div><span>勞退請領時估算金額</span><strong>{view.laborPensionEnabled && view.estimate?.laborPension.projectedAccountBalanceTwd ? currency.format(Number(view.estimate.laborPension.projectedAccountBalanceTwd)) : '尚未設定'}</strong><small>{view.laborPensionEnabled && eligibility ? !eligibility.pension.eligible ? `尚未符合請領條件（一般須滿 ${eligibility.pension.minimumAge} 歲）` : eligibility.pension.monthlyEligible ? '已達一般年齡與月領年資條件' : '已達一般請領年齡；年資未滿 15 年，僅適用一次領' : '請至退休制度完成設定'}</small><small>{view.estimate ? `${view.estimate.laborPension.claimMonth} 設定請領 · ${view.estimate.laborPension.status === 'monthly' ? `月領，首期約 ${currency.format(Number(view.estimate.laborPension.monthlyBenefitNominalTwd))}／月` : '一次領'}` : ''}</small></div></article> })}</div>
    </section>

    {data.incomes.length === 0 && data.expenses.length === 0 && data.retirementSystems.length === 0 && <section className="panel"><h3>如果我要做完整退休規劃</h3><p>目前已完成資產預測。若要估算退休時間，可繼續補上收入、支出、勞保與勞退。</p><button className="button secondary" type="button" onClick={onContinueFullPlan}>繼續完成退休規劃</button></section>}

    <section className="panel secondary-summary"><div className="panel-heading"><div><h3>家庭財務概況</h3><p>次要參考資訊；尚未設定的資料不會被當成 0。</p></div><button className="button secondary" type="button" onClick={onOpenData}>查看／編輯家庭資料</button></div><div className="cashflow-grid">{([['每月收入', financialOverview.household.monthlyIncomeTwd], ['每月平均支出', financialOverview.household.monthlyExpenseTwd], ['每月負債還款', financialOverview.household.monthlyDebtPaymentTwd], ['每月投資', financialOverview.household.monthlyContributionTwd], ['每月可支配餘額', financialOverview.household.unallocatedTwd]] as const).map(([label, value]) => <article key={label}><span>{label}</span><strong>{value === undefined ? '尚未設定' : currency.format(Number(value))}</strong></article>)}</div><div className="cashflow-grid"><article><span>總資產</span><strong>{currency.format(Number(financialOverview.assets.totalTwd))}</strong></article><article><span>總負債</span><strong>{currency.format(Number(financialOverview.assets.liabilitiesTwd))}</strong></article><article><span>淨資產</span><strong>{currency.format(Number(financialOverview.assets.netWorthTwd))}</strong></article></div>{financialOverview.accounts.length > 0 && <><h4>帳戶摘要（共 {financialOverview.accountCount} 個帳戶）</h4><div className="data-list">{financialOverview.accounts.slice(0, 4).map((account) => <article key={account.id}><div><strong>{account.name}</strong><p>{account.institution ?? account.accountType} · {account.assetCount} 筆資產</p></div><strong>{account.totalTwd === undefined ? '尚未設定' : currency.format(Number(account.totalTwd))}</strong></article>)}</div>{financialOverview.accountCount > 4 && <p className="muted">另有 {financialOverview.accountCount - 4} 個帳戶。</p>}</>}</section>

    {projection?.warnings.map((warning) => <div className="message warning" key={`${warning.code}-${warning.entityId ?? ''}`}><AlertTriangle size={18} /><span>{warning.message}</span></div>)}
  </div>
}
