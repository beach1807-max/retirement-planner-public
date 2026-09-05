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
      laborPension: { claimMode: String(form.get('claimMode')) as 'lumpSum' | 'monthly', enabled: form.get('laborPensionEnabled') === 'on', currentAccountBalanceTwd: String(form.get('currentAccountBalanceTwd')), contributionYears: String(form.get('contributionYears')), monthlyContributionSalaryTwd: String(form.get('monthlyContributionSalaryTwd')), employerContributionRate: (Number(form.get('employerContributionPercent')) / 100).toString(), voluntaryContributionRate: (Number(form.get('voluntaryContributionPercent')) / 100).toString(), projectedAnnualReturnRate: (Number(form.get('projectedReturnPercent')) / 100).toString(), claimAge: Number(form.get('laborPensionClaimAge')) },
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    await onChange({ ...data, retirementSystems: existing ? data.retirementSystems.map((item) => item.id === existing.id ? record : item) : [...data.retirementSystems, record] })
    setMessage('退休制度資料已儲存並重新估算。')
  }

  return <div className="page-stack">
    <section className="panel"><div className="panel-heading"><div><h2><Scale size={21} /> <CalculationHelp label="勞保" topic="laborInsurance" />與<CalculationHelp label="勞退" topic="laborPension" />估算</h2><p>勞保是每月退休收入；勞退是累積在個人專戶的資產。資料還沒查到時，先保留「未提供」。結果僅供規劃，實際資格與金額以主管機關核定為準。</p></div></div><p className="muted">資料去哪裡找：登入勞保局 e 化服務系統的個人專區，查詢投保紀錄與勞退個人專戶。沒有資料時可稍後補填。</p><div className="source-links"><a href="https://www.bli.gov.tw/0019436.htm" target="_blank" rel="noreferrer">投保資料與勞退查詢方式 <ExternalLink size={15} /></a><a href="https://www.bli.gov.tw/0012986.html" target="_blank" rel="noreferrer">個人專戶查詢步驟 <ExternalLink size={15} /></a><a href={TAIWAN_LABOR_RULES_2026.sources[0]} target="_blank" rel="noreferrer">勞保給付標準 <ExternalLink size={15} /></a><a href={TAIWAN_LABOR_RULES_2026.sources[2]} target="_blank" rel="noreferrer">勞退月退休金基礎 <ExternalLink size={15} /></a></div>{message && <div className="alert success" role="status">{message}</div>}</section>
    {data.members.filter((member) => member.role !== 'other').map((member) => {
      const record = data.retirementSystems.find((item) => item.memberId === member.id)
      const view = estimates.find((item) => item.memberId === member.id)
      const insurance = record?.laborInsurance ?? { enabled: false, averageInsuredSalaryTwd: '0', insuredYears: '0', claimAge: 65 }
      const pension = record?.laborPension ?? { enabled: false, currentAccountBalanceTwd: '0', contributionYears: '0', monthlyContributionSalaryTwd: '0', employerContributionRate: '0.06', voluntaryContributionRate: '0', projectedAnnualReturnRate: '0.02', claimAge: 60 }
      return <section className="panel" key={member.id}>
        <div className="panel-heading"><div><h2>{member.name}</h2><p>{record?.status === 'notProvided' ? '資料未提供，本制度不納入預測。' : record?.status === 'notApplicable' ? '已標示不適用。' : '依目前輸入估算。'}</p></div></div>
        <form className="settings-form" onSubmit={(event) => save(event, member.id)}>
          <label>資料狀態<select name="status" defaultValue={record?.status ?? 'notProvided'}><option value="provided">已提供</option><option value="notProvided">未提供</option><option value="notApplicable">不適用</option></select></label>
          <fieldset><legend><label className="checkbox-row"><input name="laborInsuranceEnabled" type="checkbox" defaultChecked={insurance.enabled} /><span>估算勞保老年年金（固定月領）</span></label></legend><div className="context-help-row"><CalculationHelp label="平均月投保薪資" topic="insuredSalary" /><CalculationHelp label="勞保年資" topic="insuredYears" /></div><div className="form-grid three"><label>最高 60 個月平均月投保薪資<input name="averageInsuredSalaryTwd" type="number" min="0" required defaultValue={insurance.averageInsuredSalaryTwd} /><small>不是實領月薪。請依投保紀錄確認最高 60 個月平均月投保薪資；不確定時先不啟用勞保估算。</small></label><label>勞保年資<input name="insuredYears" type="number" min="0" step="any" required defaultValue={insurance.insuredYears} /><small>查詢勞保投保年資後填入。本系統使用填入的年資，不會自動增加未來工作年數。</small></label><label>請領年齡<input name="laborInsuranceClaimAge" type="number" min="55" max="90" required defaultValue={insurance.claimAge} /><small>填預計開始月領的年齡；可參考下方估算與官方給付標準。</small></label></div></fieldset>
          <fieldset><legend><label className="checkbox-row"><input name="laborPensionEnabled" type="checkbox" defaultChecked={pension.enabled} /><span>估算勞退新制退休金</span></label></legend><div className="context-help-row"><CalculationHelp label="提繳率" topic="pensionContributionRate" /><CalculationHelp label="年報酬" topic="annualReturn" /></div><div className="form-grid three"><label>勞退請領模式<select name="claimMode" defaultValue={record?.laborPension.claimMode ?? 'monthly'}><option value="lumpSum">一次領</option><option value="monthly">月領</option></select><small>月領需符合請領資格及提繳年資。修改後按「儲存並估算」比較結果。</small></label><label>勞退目前專戶金額<input name="currentAccountBalanceTwd" type="number" min="0" required defaultValue={pension.currentAccountBalanceTwd} /><small>從勞退個人專戶查詢，填入目前本金加上已列示收益。</small></label><label>目前提繳年資<input name="contributionYears" type="number" min="0" step="any" required defaultValue={pension.contributionYears} /><small>填目前已累積的勞退提繳年資，與勞保年資不同。可查個人專戶或向人資確認。</small></label><label>月提繳工資<input name="monthlyContributionSalaryTwd" type="number" min="0" required defaultValue={pension.monthlyContributionSalaryTwd} /><small>填公司申報的月提繳工資，可查提繳資料或向人資確認，不一定等於實領薪水。</small></label><label>雇主提繳率（%）<input name="employerContributionPercent" type="number" min="6" step="0.1" required defaultValue={Number(pension.employerContributionRate) * 100} /><small>公司替你提繳的比例，請向人資確認；目前預設 6%。</small></label><label>自願提繳率（%）<input name="voluntaryContributionPercent" type="number" min="0" max="6" step="0.1" required defaultValue={Number(pension.voluntaryContributionRate) * 100} /><small>自己額外提繳的比例，請查薪資單或向人資確認；沒有自提填 0%。</small></label><label>專戶預估年報酬（%）<input name="projectedReturnPercent" type="number" min="-99" step="0.1" required defaultValue={Number(pension.projectedAnnualReturnRate) * 100} /><small>這是你的未來報酬假設，不是官方保證；三種情境會再上下調整。</small></label><label>請領年齡<input name="laborPensionClaimAge" type="number" min="60" max="85" required defaultValue={pension.claimAge} /><small>填預計請領勞退的年齡。本次模型提繳至請領前，之後保留請領時金額，不推測如何花用。</small></label></div></fieldset>
          <div className="form-actions"><button className="button primary" type="submit"><Save size={18} /> 儲存並估算</button></div>
        </form>
        {view?.estimate && <div className="retirement-system-results"><article><span>勞保月領估算</span><strong>{insurance.enabled && view.estimate.laborInsurance.monthlyBenefitRealTwd ? currency.format(Number(view.estimate.laborInsurance.monthlyBenefitRealTwd)) : '—'}</strong><small>{view.estimate.laborInsurance.claimMonth} 起 · 今天購買力</small></article><article><span>勞退預估專戶</span><strong>{pension.enabled && view.estimate.laborPension.projectedAccountBalanceTwd ? currency.format(Number(view.estimate.laborPension.projectedAccountBalanceTwd)) : '—'}</strong><small>{view.estimate.laborPension.status === 'monthly' ? `首期月領約 ${currency.format(Number(view.estimate.laborPension.monthlyBenefitNominalTwd))}（今天購買力 ${currency.format(Number(view.estimate.laborPension.monthlyBenefitRealTwd))}），估計給付期間 ${view.estimate.laborPension.lifeExpectancyYears} 年；非終身保證，金額可能依利率調整。` : view.estimate.laborPension.status === 'lumpSum' ? '選擇一次領：上方金額為請領時一次給付估算'  : view.estimate.laborPension.status === 'lumpSumOnly' ? '預估提繳年資未滿 15 年，無法月領；上方列一次領估算，請改選一次領' : '無法估算'}</small></article></div>}
      </section>
    })}
  </div>
}
