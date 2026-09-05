import { useEffect, useState, type FormEvent } from 'react'
import { FlaskConical, Plus, Trash2 } from 'lucide-react'
import type { PlannerData, PlannerScenario } from '../application/planner-data'
import { ScenarioService, type ScenarioResult } from '../application/scenario-service'
import { CalculationHelp } from './CalculationHelp'

interface Props { data: PlannerData; service: ScenarioService; onChange: (data: PlannerData) => void | Promise<void> }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })

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

  return <div className="page-stack"><section className="panel"><div className="panel-heading"><div><h2><FlaskConical size={21} /> <CalculationHelp label="投入方案比較" topic="contribution" /></h2><p>比較不同投入計畫對未來資產的影響，不判斷何時應該退休。</p></div><small>projection-contract-v0.2</small></div></section>
    <section className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="新增投入方案" topic="contributionEnd" /></h3><p>可調整每月投入、勞退自提，以及既有投入的停止月份。</p></div></div><form className="settings-form" onSubmit={create}><div className="form-grid three"><label>方案名稱<input name="name" required placeholder="例如：每月多投入一萬元" /></label><label>既有投入停止月份<input name="plannedRetirementMonth" type="month" /></label><label>每月額外投入（TWD）<input name="additionalContribution" type="number" min="0" defaultValue="0" /></label></div><label className="checkbox-row"><input name="voluntarySix" type="checkbox" /><span>主要規劃人勞退自提改為 6%</span></label>{error && <div className="alert error" role="alert">{error}</div>}<div className="form-actions"><button className="button primary" type="submit"><Plus size={18} />建立方案</button></div></form></section>
    <section className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="未來資產比較" topic="purchasingPower" /></h3><p>全部以穩健情境及今天購買力呈現，並保留<CalculationHelp label="輸入 hash" topic="scenarioHash" />供結果重現。</p></div></div>{!results ? <p role="status">正在計算情境…</p> : <div className="scenario-table-wrap"><table className="scenario-table"><thead><tr><th>方案</th><th>10 年後</th><th>20 年後</th><th>30 年後</th><th>35 年後</th><th>版本／動作</th></tr></thead><tbody>{results.map((result) => <tr key={result.scenarioId}><th>{result.name}{result.warnings.map((warning) => <small key={warning}>{warning}</small>)}</th>{([10, 20, 30, 35] as const).map((years) => <td key={years}>{result.futureAssetsReal[years] ? currency.format(Number(result.futureAssetsReal[years])) : '—'}</td>)}<td><small>{result.contractVersion}<br />{result.ruleVersion}<br />hash {result.inputHash.slice(0, 8)}</small>{result.scenarioId !== 'baseline' && <button className="icon-button danger" aria-label={`刪除方案 ${result.name}`} onClick={() => void remove(result.scenarioId)}><Trash2 size={18} /></button>}</td></tr>)}</tbody></table></div>}</section>
  </div>
}
