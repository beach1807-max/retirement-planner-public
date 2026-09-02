import { useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import type { PlannerData } from '../application/planner-data'

interface Props { data: PlannerData; onChange: (data: PlannerData) => void | Promise<void> }

export function SettingsPage({ data, onChange }: Props) {
  const [saved, setSaved] = useState(false)
  const primary = data.members.find((member) => member.id === data.household.primaryMemberId)!

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const annualReturnRate = (Number(form.get('annualReturnPercent')) / 100).toString()
    const annualInflationRate = (Number(form.get('annualInflationPercent')) / 100).toString()
    const now = new Date().toISOString()
    const members = data.members.map((member) => ({
      ...member,
      planningEndAge: member.id === primary.id ? Number(form.get('planningEndAge')) : member.planningEndAge,
      plannedRetirementMonth: String(form.get(`plannedRetirementMonth-${member.id}`)) || undefined,
      updatedAt: now,
    }))
    const expenseNames = form.getAll('oneTimeExpenseName').map(String)
    const expenseIds = form.getAll('oneTimeExpenseId').map(String)
    const expenseMonths = form.getAll('oneTimeExpenseMonth').map(String)
    const expenseAmounts = form.getAll('oneTimeExpenseAmount').map(String)
    const oneTimeExpenses = expenseNames.flatMap((name, index) => name && expenseMonths[index] && expenseAmounts[index] ? [{ id: expenseIds[index] || crypto.randomUUID(), name, month: expenseMonths[index], amountTwdReal: expenseAmounts[index] }] : [])
    void onChange({
      ...data,
      calculationBaseDate: String(form.get('calculationBaseDate')),
      members,
      retirementPlan: {
        ...data.retirementPlan,
        earliestRetirementMonth: String(form.get('earliestRetirementMonth')),
        retirementExpenseMonthlyRealTwd: String(form.get('retirementExpenseMonthlyRealTwd')),
        safetyReserveRealTwd: String(form.get('safetyReserveRealTwd')),
        legacyTargetRealTwd: String(form.get('legacyTargetRealTwd')),
        oneTimeExpenses,
      },
      assumptions: {
        ...data.assumptions,
        annualInflationRate,
        returnProfiles: data.assumptions.returnProfiles.map((profile) => profile.id === 'balanced' ? { ...profile, name: `基準 ${Number(form.get('annualReturnPercent'))}%`, annualReturnRate } : profile),
      },
    })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  const balanced = data.assumptions.returnProfiles.find((profile) => profile.id === 'balanced')!
  return (
    <div className="page-stack narrow-page">
      <section className="panel">
        <div className="panel-heading"><div><h2>退休與預測假設</h2><p>生活費以計算基準日的今天購買力輸入，系統會在月份時間軸中處理通膨。</p></div></div>
        <form className="settings-form" onSubmit={submit}>
          <fieldset><legend>時間範圍</legend><div className="form-grid two"><label>計算基準日<input name="calculationBaseDate" type="date" required defaultValue={data.calculationBaseDate} /></label><label>最早允許退休月份<input name="earliestRetirementMonth" type="month" required defaultValue={data.retirementPlan.earliestRetirementMonth} /></label><label>規劃終點年齡<input name="planningEndAge" type="number" min="70" max="120" required defaultValue={primary.planningEndAge} /></label>{data.members.filter((member) => member.role !== 'other').map((member) => <label key={member.id}>{member.role === 'primary' ? '主要規劃人' : '伴侶'}預計退休月份<input name={`plannedRetirementMonth-${member.id}`} type="month" required={member.role === 'primary'} min={data.calculationBaseDate.slice(0, 7)} defaultValue={member.plannedRetirementMonth} /></label>)}</div></fieldset>
          <fieldset><legend>退休需求（今天購買力）</legend><div className="form-grid two"><label>每月退休生活費<input name="retirementExpenseMonthlyRealTwd" type="number" min="0" required defaultValue={data.retirementPlan.retirementExpenseMonthlyRealTwd} /></label><label>安全準備金<input name="safetyReserveRealTwd" type="number" min="0" required defaultValue={data.retirementPlan.safetyReserveRealTwd} /></label><label>指定遺產目標<input name="legacyTargetRealTwd" type="number" min="0" required defaultValue={data.retirementPlan.legacyTargetRealTwd} /></label></div></fieldset>
          <fieldset><legend>一次性支出（今天購買力）</legend><p className="muted">可保存多筆；每次儲存後會保留一列空白供新增。</p>{[...data.retirementPlan.oneTimeExpenses, { id: '', name: '', month: '', amountTwdReal: '' }].map((expense, index) => <div className="form-grid three" key={expense.id || `new-${index}`}><input type="hidden" name="oneTimeExpenseId" value={expense.id} /><label>項目<input name="oneTimeExpenseName" defaultValue={expense.name} /></label><label>月份<input name="oneTimeExpenseMonth" type="month" defaultValue={expense.month} /></label><label>金額<input name="oneTimeExpenseAmount" type="number" min="0" defaultValue={expense.amountTwdReal} /></label></div>)}</fieldset>
          <fieldset><legend>基準情境</legend><div className="form-grid two"><label>有效年化報酬率（%）<input name="annualReturnPercent" type="number" min="-99" max="100" step="0.1" required defaultValue={Number(balanced.annualReturnRate) * 100} /><small>月報酬率使用等效複利公式，不直接除以 12。</small></label><label>年化通膨率（%）<input name="annualInflationPercent" type="number" min="-99" max="100" step="0.1" required defaultValue={Number(data.assumptions.annualInflationRate) * 100} /></label></div></fieldset>
          <div className="form-actions"><span className="save-status" role="status">{saved ? '設定已儲存並重新計算。' : ''}</span><button className="button primary" type="submit"><Save size={18} /> 儲存設定</button></div>
        </form>
      </section>
      <div className="alert info">第一版尚未納入稅務、交易成本、完整勞保／勞退與隨機市場波動；相關模組介面已保留。</div>
    </div>
  )
}
