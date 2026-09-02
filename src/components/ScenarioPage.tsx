import { useEffect, useState, type FormEvent } from 'react'
import { FlaskConical, Plus, Trash2 } from 'lucide-react'
import type { PlannerData, PlannerScenario } from '../application/planner-data'
import { ScenarioService, type ScenarioResult } from '../application/scenario-service'

interface Props { data: PlannerData; service: ScenarioService; onChange: (data: PlannerData) => void | Promise<void> }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const age = (months: number | null) => months === null ? '—' : `${Math.floor(months / 12)} 歲 ${months % 12} 月`

export function ScenarioPage({ data, service, onChange }: Props) {
  const [results, setResults] = useState<ScenarioResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { let active = true; service.compare(data).then((value) => { if (active) setResults(value) }); return () => { active = false } }, [data, service])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const plannedRetirementMonth = String(form.get('plannedRetirementMonth') ?? '')
    const additional = String(form.get('additionalContribution') ?? '')
    const voluntary = form.get('voluntarySix') === 'on' ? '0.06' : undefined
    if (!plannedRetirementMonth && (!additional || Number(additional) === 0) && !voluntary) { setError('至少需要一項情境覆寫。'); return }
    const now = new Date().toISOString()
    const scenario: PlannerScenario = { id: crypto.randomUUID(), householdId: data.household.id, name: String(form.get('name')), version: 'scenario-v0.1', baseDataUpdatedAt: data.updatedAt, contractVersion: 'calculation-contract-v0.1', ruleVersion: 'tw-labor-rules-2026-08-20', overrides: { plannedRetirementMonth: plannedRetirementMonth || undefined, additionalMonthlyContributionTwd: additional && Number(additional) > 0 ? additional : undefined, primaryLaborPensionVoluntaryRate: voluntary }, createdAt: now, updatedAt: now }
    await onChange({ ...data, scenarios: [...data.scenarios, scenario] })
    setError(null); formElement.reset()
  }

  async function remove(id: string) { await onChange({ ...data, scenarios: data.scenarios.filter((item) => item.id !== id) }) }

  return <div className="page-stack"><section className="panel"><div className="panel-heading"><div><h2><FlaskConical size={21} /> 情境比較</h2><p>情境只覆寫正式資料的試算複本，不會改動家庭、資產或退休制度資料。</p></div><small>scenario-v0.1</small></div></section>
    <section className="panel"><div className="panel-heading"><div><h3>新增情境</h3><p>可單獨或組合調整退休月份、每月投入與勞退自提。</p></div></div><form className="settings-form" onSubmit={create}><div className="form-grid three"><label>情境名稱<input name="name" required placeholder="例如：提早退休" /></label><label>預計退休月份<input name="plannedRetirementMonth" type="month" /></label><label>每月額外投入（TWD）<input name="additionalContribution" type="number" min="0" defaultValue="0" /></label></div><label className="checkbox-row"><input name="voluntarySix" type="checkbox" /><span>主要規劃人勞退自提改為 6%</span></label>{error && <div className="alert error" role="alert">{error}</div>}<div className="form-actions"><button className="button primary" type="submit"><Plus size={18} />建立情境</button></div></form></section>
    <section className="panel"><div className="panel-heading"><div><h3>方案比較</h3><p>使用相同計算契約與法規版本；結果可由基準資料時間與情境 hash 重現。</p></div></div>{!results ? <p role="status">正在計算情境…</p> : <div className="scenario-table-wrap"><table className="scenario-table"><thead><tr><th>方案</th><th>可退休年齡</th><th>退休時資產</th><th>準備率</th><th>退休月收入</th><th>版本／動作</th></tr></thead><tbody>{results.map((result) => <tr key={result.scenarioId}><th>{result.name}{result.warnings.map((warning) => <small key={warning}>{warning}</small>)}</th><td>{age(result.retirementAgeInMonths)}</td><td>{result.retirementAssetsAtRetirement ? currency.format(Number(result.retirementAssetsAtRetirement)) : '—'}</td><td>{result.readinessRate ? `${result.readinessRate}%` : '—'}</td><td>{result.retirementIncomeMonthlyRealTwd ? currency.format(Number(result.retirementIncomeMonthlyRealTwd)) : '—'}</td><td><small>{result.contractVersion}<br />{result.ruleVersion}<br />hash {result.inputHash.slice(0, 8)}</small>{result.scenarioId !== 'baseline' && <button className="icon-button danger" aria-label={`刪除情境 ${result.name}`} onClick={() => void remove(result.scenarioId)}><Trash2 size={18} /></button>}</td></tr>)}</tbody></table></div>}</section>
  </div>
}
