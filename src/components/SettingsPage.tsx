import { useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import type { PlannerData } from '../application/planner-data'
import { CalculationHelp } from './CalculationHelp'

interface Props { data: PlannerData; onChange: (data: PlannerData) => void | Promise<void> }

export function SettingsPage({ data, onChange }: Props) {
  const [saved, setSaved] = useState(false)
  const primary = data.members.find((member) => member.id === data.household.primaryMemberId)!

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const annualReturnRate = (Number(form.get('annualReturnPercent')) / 100).toString()
    const annualInflationRate = (Number(form.get('annualInflationPercent')) / 100).toString()
    const assetReturnPresets = data.assumptions.assetReturnPresets.map((preset) => ({
      ...preset,
      scenarioRates: {
        conservative: (Number(form.get(`preset-${preset.key}-conservative`)) / 100).toString(),
        balanced: (Number(form.get(`preset-${preset.key}-balanced`)) / 100).toString(),
        optimistic: (Number(form.get(`preset-${preset.key}-optimistic`)) / 100).toString(),
      },
    }))
    if (assetReturnPresets.some((preset) => Number(preset.scenarioRates.conservative) > Number(preset.scenarioRates.balanced) || Number(preset.scenarioRates.balanced) > Number(preset.scenarioRates.optimistic))) return
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
        assetReturnPresets,
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
        <div className="panel-heading"><div><h2>預測設定</h2><p>調整未來累積與購買力的假設。相同本金與投入計畫，會同時比較三種報酬情境。</p></div></div>
        <form className="settings-form" onSubmit={submit}>
          <fieldset><legend>報酬與物價假設</legend><div className="context-help-row"><CalculationHelp label="預估年報酬率" topic="annualReturn" /><CalculationHelp label="年通膨率" topic="inflation" /></div><div className="form-grid two"><label>預估年報酬率（%）<input name="annualReturnPercent" type="number" min="-99" max="100" step="0.1" required defaultValue={Number(balanced.annualReturnRate) * 100} /><small>使用基準報酬設定的投資套用此值；其他報酬設定與勞退另計。</small></label><label>年通膨率（%）<input name="annualInflationPercent" type="number" min="-99" max="100" step="0.1" required defaultValue={Number(data.assumptions.annualInflationRate) * 100} /></label></div></fieldset>
          <fieldset><legend>資產類別情境報酬預設</legend><p className="muted">這些是系統初始試算假設，不是保證報酬或市場預測。只會影響日後新增資產，或主動重新套用系統預設的資產；既有資產不會被自動改寫。</p>{data.assumptions.assetReturnPresets.map((preset) => <div className="form-grid four" key={preset.key}><strong>{preset.label}</strong>{([['conservative', '保守'], ['balanced', '穩健'], ['optimistic', '樂觀']] as const).map(([scenario, label]) => <label key={scenario}>{label}（%）<input name={`preset-${preset.key}-${scenario}`} type="number" min="-99" max="100" step="0.1" required defaultValue={Number(preset.scenarioRates[scenario]) * 100} /></label>)}</div>)}</fieldset>
          <label>計算基準日<input name="calculationBaseDate" type="date" required defaultValue={data.calculationBaseDate} /></label>
          <fieldset><legend>依成員日期停止投入（選填）</legend><p className="muted">只有選擇「成員退休時停止」的每月投入會使用這些日期。留白時，該筆投入會持續計算至 35 年後；也可到家庭資料為投入指定固定停止月份。</p><div className="form-grid two">{data.members.filter((member) => member.role !== 'other').map((member) => <label key={member.id}>{member.role === 'primary' ? '主要規劃人' : '伴侶'}預計退休月份<input name={`plannedRetirementMonth-${member.id}`} type="month" min={data.calculationBaseDate.slice(0, 7)} defaultValue={member.plannedRetirementMonth} /></label>)}</div></fieldset>
          <details className="advanced-settings"><summary>舊版退休試算資料（選填）</summary><p className="muted">下列生活費、準備金、遺產與支出資料保留供舊版試算使用，不會從首頁未來資產預估中扣除。</p>
          <fieldset><legend>時間範圍</legend><div className="form-grid two"><label>最早允許退休月份<input name="earliestRetirementMonth" type="month" required defaultValue={data.retirementPlan.earliestRetirementMonth} /></label><label>規劃終點年齡<input name="planningEndAge" type="number" min="70" max="120" required defaultValue={primary.planningEndAge} /></label></div></fieldset>
          <fieldset><legend>退休需求（今天購買力）</legend><div className="form-grid two"><label>每月退休生活費<input name="retirementExpenseMonthlyRealTwd" type="number" min="0" required defaultValue={data.retirementPlan.retirementExpenseMonthlyRealTwd} /></label><label>安全準備金<input name="safetyReserveRealTwd" type="number" min="0" required defaultValue={data.retirementPlan.safetyReserveRealTwd} /></label><label>指定遺產目標<input name="legacyTargetRealTwd" type="number" min="0" required defaultValue={data.retirementPlan.legacyTargetRealTwd} /></label></div></fieldset>
          <fieldset><legend>一次性支出（今天購買力）</legend><p className="muted">可保存多筆；每次儲存後會保留一列空白供新增。</p>{[...data.retirementPlan.oneTimeExpenses, { id: '', name: '', month: '', amountTwdReal: '' }].map((expense, index) => <div className="form-grid three" key={expense.id || `new-${index}`}><input type="hidden" name="oneTimeExpenseId" value={expense.id} /><label>項目<input name="oneTimeExpenseName" defaultValue={expense.name} /></label><label>月份<input name="oneTimeExpenseMonth" type="month" defaultValue={expense.month} /></label><label>金額<input name="oneTimeExpenseAmount" type="number" min="0" defaultValue={expense.amountTwdReal} /></label></div>)}</fieldset>
          </details>
          <div className="form-actions"><span className="save-status" role="status">{saved ? '設定已儲存並重新計算。' : ''}</span><button className="button primary" type="submit"><Save size={18} /> 儲存設定</button></div>
        </form>
      </section>
      <div className="alert info">目前尚未納入稅務、交易成本與隨機市場波動；勞保／勞退請至「退休制度」依版本化規則估算。</div>
    </div>
  )
}
