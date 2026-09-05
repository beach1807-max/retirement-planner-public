import { useState, type FormEvent } from 'react'
import { ExternalLink, Scale, Save } from 'lucide-react'
import type { PlannerData, PlannerRetirementSystem } from '../application/planner-data'
import type { RetirementSystemView } from '../application/planner-service'
import { TAIWAN_LABOR_RULES_2026 } from '../domain/retirement-system'
import { CalculationHelp } from './CalculationHelp'

interface Props { data: PlannerData; estimates: RetirementSystemView[]; onChange: (data: PlannerData) => void | Promise<void> }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })

export function RetirementSystemsPage({ data, estimates, onChange }: Props) {
  const [message, setMessage] = useState<string | null>(null)

  async function save(event: FormEvent<HTMLFormElement>, memberId: string) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const existing = data.retirementSystems.find((item) => item.memberId === memberId)
    const now = new Date().toISOString()
    const record: PlannerRetirementSystem = {
      id: existing?.id ?? crypto.randomUUID(), householdId: data.household.id, memberId, ruleVersion: TAIWAN_LABOR_RULES_2026.version,
      status: String(form.get('status')) as PlannerRetirementSystem['status'],
      laborInsurance: { enabled: form.get('laborInsuranceEnabled') === 'on', averageInsuredSalaryTwd: String(form.get('averageInsuredSalaryTwd')), insuredYears: String(form.get('insuredYears')), claimAge: Number(form.get('laborInsuranceClaimAge')) },
      laborPension: { enabled: form.get('laborPensionEnabled') === 'on', currentAccountBalanceTwd: String(form.get('currentAccountBalanceTwd')), contributionYears: String(form.get('contributionYears')), monthlyContributionSalaryTwd: String(form.get('monthlyContributionSalaryTwd')), employerContributionRate: (Number(form.get('employerContributionPercent')) / 100).toString(), voluntaryContributionRate: (Number(form.get('voluntaryContributionPercent')) / 100).toString(), projectedAnnualReturnRate: (Number(form.get('projectedReturnPercent')) / 100).toString(), claimAge: Number(form.get('laborPensionClaimAge')) },
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    await onChange({ ...data, retirementSystems: existing ? data.retirementSystems.map((item) => item.id === existing.id ? record : item) : [...data.retirementSystems, record] })
    setMessage('退休制度資料已儲存並重新估算。')
  }

  return <div className="page-stack">
    <section className="panel"><div className="panel-heading"><div><h2><Scale size={21} /> <CalculationHelp label="勞保" topic="laborInsurance" />與<CalculationHelp label="勞退" topic="laborPension" />估算</h2><p>規則版本 {TAIWAN_LABOR_RULES_2026.version}，查核日 {TAIWAN_LABOR_RULES_2026.checkedAt}。結果僅供規劃，實際資格與金額以主管機關核定為準。</p></div></div><div className="source-links"><a href={TAIWAN_LABOR_RULES_2026.sources[0]} target="_blank" rel="noreferrer">勞保給付標準 <ExternalLink size={15} /></a><a href={TAIWAN_LABOR_RULES_2026.sources[2]} target="_blank" rel="noreferrer">勞退月退休金基礎 <ExternalLink size={15} /></a></div>{message && <div className="alert success" role="status">{message}</div>}</section>
    {data.members.filter((member) => member.role !== 'other').map((member) => {
      const record = data.retirementSystems.find((item) => item.memberId === member.id)
      const view = estimates.find((item) => item.memberId === member.id)
      const insurance = record?.laborInsurance ?? { enabled: false, averageInsuredSalaryTwd: '0', insuredYears: '0', claimAge: 65 }
      const pension = record?.laborPension ?? { enabled: false, currentAccountBalanceTwd: '0', contributionYears: '0', monthlyContributionSalaryTwd: '0', employerContributionRate: '0.06', voluntaryContributionRate: '0', projectedAnnualReturnRate: '0.02', claimAge: 60 }
      return <section className="panel" key={member.id}>
        <div className="panel-heading"><div><h2>{member.name}</h2><p>{record?.status === 'notProvided' ? '資料未提供，本制度不納入預測。' : record?.status === 'notApplicable' ? '已標示不適用。' : '依目前輸入估算。'}</p></div></div>
        <form className="settings-form" onSubmit={(event) => save(event, member.id)}>
          <label>資料狀態<select name="status" defaultValue={record?.status ?? 'notProvided'}><option value="provided">已提供</option><option value="notProvided">未提供</option><option value="notApplicable">不適用</option></select></label>
          <fieldset><legend><label className="checkbox-row"><input name="laborInsuranceEnabled" type="checkbox" defaultChecked={insurance.enabled} /><span>估算勞保老年年金</span></label></legend><div className="context-help-row"><CalculationHelp label="平均月投保薪資" topic="insuredSalary" /><CalculationHelp label="勞保年資" topic="insuredYears" /></div><div className="form-grid three"><label>最高 60 個月平均月投保薪資<input name="averageInsuredSalaryTwd" type="number" min="0" required defaultValue={insurance.averageInsuredSalaryTwd} /></label><label>勞保年資<input name="insuredYears" type="number" min="0" step="any" required defaultValue={insurance.insuredYears} /></label><label>請領年齡<input name="laborInsuranceClaimAge" type="number" min="55" max="90" required defaultValue={insurance.claimAge} /></label></div></fieldset>
          <fieldset><legend><label className="checkbox-row"><input name="laborPensionEnabled" type="checkbox" defaultChecked={pension.enabled} /><span>估算勞退新制退休金</span></label></legend><div className="context-help-row"><CalculationHelp label="提繳率" topic="pensionContributionRate" /><CalculationHelp label="年報酬" topic="annualReturn" /></div><div className="form-grid three"><label>目前專戶本金及收益<input name="currentAccountBalanceTwd" type="number" min="0" required defaultValue={pension.currentAccountBalanceTwd} /></label><label>目前提繳年資<input name="contributionYears" type="number" min="0" step="any" required defaultValue={pension.contributionYears} /></label><label>月提繳工資<input name="monthlyContributionSalaryTwd" type="number" min="0" required defaultValue={pension.monthlyContributionSalaryTwd} /></label><label>雇主提繳率（%）<input name="employerContributionPercent" type="number" min="6" step="0.1" required defaultValue={Number(pension.employerContributionRate) * 100} /></label><label>自願提繳率（%）<input name="voluntaryContributionPercent" type="number" min="0" max="6" step="0.1" required defaultValue={Number(pension.voluntaryContributionRate) * 100} /></label><label>專戶預估年報酬（%）<input name="projectedReturnPercent" type="number" min="-99" step="0.1" required defaultValue={Number(pension.projectedAnnualReturnRate) * 100} /></label><label>請領年齡<input name="laborPensionClaimAge" type="number" min="60" max="85" required defaultValue={pension.claimAge} /></label></div></fieldset>
          <div className="form-actions"><button className="button primary" type="submit"><Save size={18} /> 儲存並估算</button></div>
        </form>
        {view?.estimate && <div className="retirement-system-results"><article><span>勞保月領估算</span><strong>{insurance.enabled && view.estimate.laborInsurance.monthlyBenefitRealTwd ? currency.format(Number(view.estimate.laborInsurance.monthlyBenefitRealTwd)) : '—'}</strong><small>{view.estimate.laborInsurance.claimMonth} 起 · 今天購買力</small></article><article><span>勞退預估專戶</span><strong>{pension.enabled && view.estimate.laborPension.projectedAccountBalanceTwd ? currency.format(Number(view.estimate.laborPension.projectedAccountBalanceTwd)) : '—'}</strong><small>{view.estimate.laborPension.status === 'monthly' ? `首期月領約 ${currency.format(Number(view.estimate.laborPension.monthlyBenefitRealTwd))}` : view.estimate.laborPension.status === 'lumpSumOnly' ? '提繳年資未滿 15 年，僅一次領' : '無法估算'}</small></article></div>}
      </section>
    })}
  </div>
}
