import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { FlaskConical, Plus, Save, Trash2 } from 'lucide-react'
import type { PlannerData, PlannerScenario } from '../application/planner-data'
import { ScenarioService, type ScenarioResult } from '../application/scenario-service'

interface Props { data: PlannerData; service: ScenarioService; onChange: (data: PlannerData) => void | Promise<void> }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const basisLabels = { conservative: '保守', balanced: '穩健', optimistic: '比較樂觀' }

function createScenario(data: PlannerData, name: string, overrides: PlannerScenario['overrides']): PlannerScenario {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), householdId: data.household.id, name, version: 'scenario-v0.2', baseDataUpdatedAt: data.updatedAt, contractVersion: 'calculation-contract-v0.1', ruleVersion: 'tw-labor-rules-2026-08-20', overrides, createdAt: now, updatedAt: now }
}

export function ScenarioPage({ data, service, onChange }: Props) {
  const [basis, setBasis] = useState<ScenarioResult['basis']>('balanced')
  const [draft, setDraft] = useState<PlannerScenario | null>(null)
  const [results, setResults] = useState<ScenarioResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scenarios = useMemo(() => draft ? [...data.scenarios, draft] : data.scenarios, [data.scenarios, draft])
  useEffect(() => { let active = true; service.compare({ ...data, scenarios }, basis).then((value) => { if (active) setResults(value) }); return () => { active = false } }, [basis, data, scenarios, service])
  const primary = data.members.find((member) => member.id === data.household.primaryMemberId)!

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const additional = String(form.get('additionalContribution') ?? '')
    const retirement = String(form.get('plannedRetirementMonth') ?? '')
    const inflation = String(form.get('annualInflationRate') ?? '')
    const voluntary = String(form.get('voluntaryRate') ?? '')
    const laborClaimAge = String(form.get('laborClaimAge') ?? '')
    const pensionClaimAge = String(form.get('pensionClaimAge') ?? '')
    const pensionClaimMode = String(form.get('pensionClaimMode') ?? '')
    const contributionId = String(form.get('contributionId') ?? '')
    const contributionAmount = String(form.get('contributionAmount') ?? '')
    const contributionStart = String(form.get('contributionStartDate') ?? '')
    const contributionEndRule = String(form.get('contributionEndRule') ?? '') as PlannerScenario['overrides']['contributionOverrides'] extends Array<infer T> | undefined ? T extends { endRule?: infer R } ? R : never : never
    const contributionEndDate = String(form.get('contributionEndDate') ?? '')
    const assetId = String(form.get('assetId') ?? '')
    const assetBalanced = String(form.get('assetBalanced') ?? '')
    const rebalance = ['stock', 'bond', 'moneyMarket', 'cash', 'other'].map((assetClass) => ({ assetClass, targetWeight: String(form.get(`target-${assetClass}`) ?? '') })).filter((item) => item.targetWeight !== '').map((item) => ({ ...item, targetWeight: String(Number(item.targetWeight) / 100) }))
    if (!retirement && (!additional || Number(additional) === 0) && !inflation && !voluntary && !laborClaimAge && !pensionClaimAge && !pensionClaimMode && !contributionAmount && !contributionStart && !contributionEndRule && !assetBalanced && rebalance.length === 0) { setError('至少需要一項情境覆寫。'); return }
    const overrides: PlannerScenario['overrides'] = {
      memberRetirement: retirement ? [{ memberId: primary.id, plannedRetirementMonth: retirement }] : undefined,
      additionalContributions: additional && Number(additional) >= 0 ? [{ id: crypto.randomUUID(), sourceMemberId: primary.id, amountTwd: additional, startDate: data.calculationBaseDate, endRule: retirement ? 'ownerRetirement' : 'planEnd', returnProfileId: data.retirementPlan.defaultReturnProfileId }] : undefined,
      annualInflationRate: inflation ? String(Number(inflation) / 100) : undefined,
      contributionOverrides: contributionId && (contributionAmount || contributionStart || contributionEndRule) ? [{ contributionId, amountTwd: contributionAmount || undefined, startDate: contributionStart || undefined, endRule: contributionEndRule || undefined, endDate: contributionEndDate || undefined }] : undefined,
      assetRates: assetId && assetBalanced ? [{ assetId, scenarioRates: { conservative: String(Number(form.get('assetConservative')) / 100), balanced: String(Number(assetBalanced) / 100), optimistic: String(Number(form.get('assetOptimistic')) / 100) } }] : undefined,
      retirementSystems: voluntary || laborClaimAge || pensionClaimAge || pensionClaimMode ? [{ memberId: primary.id, laborPensionVoluntaryRate: voluntary ? String(Number(voluntary) / 100) : undefined, laborInsuranceClaimAge: laborClaimAge ? Number(laborClaimAge) : undefined, laborPensionClaimAge: pensionClaimAge ? Number(pensionClaimAge) : undefined, laborPensionClaimMode: pensionClaimMode ? pensionClaimMode as 'lumpSum' | 'monthly' : undefined }] : undefined,
      rebalance: rebalance.length ? { targetWeights: rebalance as NonNullable<PlannerScenario['overrides']['rebalance']>['targetWeights'] } : undefined,
    }
    setDraft(createScenario(data, String(form.get('name')), overrides)); setError(null); event.currentTarget.reset()
  }
  async function saveDraft() { if (!draft) return; await onChange({ ...data, scenarios: [...data.scenarios, draft] }); setDraft(null) }
  async function remove(id: string) { await onChange({ ...data, scenarios: data.scenarios.filter((item) => item.id !== id) }) }
  function quick(name: string, overrides: PlannerScenario['overrides']) { setDraft(createScenario(data, name, overrides)); setError(null) }

  return <div className="page-stack">
    <section className="panel"><div className="panel-heading"><div><h2><FlaskConical size={21} /> 情境模擬</h2><p>改變一項或多項條件，與目前方案比較未來結果；顯示的是規劃假設，不是退休可行性保證。</p></div><label>比較使用哪個報酬情境？<select value={basis} onChange={(event) => setBasis(event.target.value as ScenarioResult['basis'])}>{Object.entries(basisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="action-row"><button className="button secondary" type="button" onClick={() => quick('每月多投入 5,000', { additionalContributions: [{ id: crypto.randomUUID(), sourceMemberId: primary.id, amountTwd: '5000', startDate: data.calculationBaseDate, endRule: 'planEnd', returnProfileId: data.retirementPlan.defaultReturnProfileId }] })}>每月多投入 5,000</button><button className="button secondary" type="button" onClick={() => quick('每月多投入 10,000', { additionalContributions: [{ id: crypto.randomUUID(), sourceMemberId: primary.id, amountTwd: '10000', startDate: data.calculationBaseDate, endRule: 'planEnd', returnProfileId: data.retirementPlan.defaultReturnProfileId }] })}>每月多投入 10,000</button><button className="button secondary" type="button" onClick={() => quick('提早 3 年退休', { memberRetirement: [{ memberId: primary.id, plannedRetirementMonth: `${Number(primary.plannedRetirementMonth?.slice(0, 4) ?? 2035) - 3}${primary.plannedRetirementMonth?.slice(4) ?? '-01'}` }] })}>提早 3 年退休</button><button className="button secondary" type="button" onClick={() => quick('延後 3 年退休', { memberRetirement: [{ memberId: primary.id, plannedRetirementMonth: `${Number(primary.plannedRetirementMonth?.slice(0, 4) ?? 2035) + 3}${primary.plannedRetirementMonth?.slice(4) ?? '-01'}` }] })}>延後 3 年退休</button><button className="button secondary" type="button" onClick={() => quick('勞退自提 6%', { retirementSystems: [{ memberId: primary.id, laborPensionVoluntaryRate: '0.06' }] })}>勞退自提 6%</button><button className="button secondary" type="button" onClick={() => quick('通膨 3%', { annualInflationRate: '0.03' })}>通膨 3%</button></div>{draft && <div className="alert info" role="status">目前正在暫存試算「{draft.name}」，尚未寫入你的正式資料。<button className="button small" type="button" onClick={() => void saveDraft()}><Save size={16} /> 儲存此情境</button><button className="button small" type="button" onClick={() => setDraft(null)}>捨棄</button></div>}</section>
    <section className="panel"><h3>建立情境</h3><form className="settings-form" onSubmit={create}><label>方案名稱<input name="name" required placeholder="例如：每月多投入一萬元" /></label><details open><summary>投入計畫</summary><div className="form-grid three"><label>每月額外投入（TWD）<input name="additionalContribution" type="number" min="0" defaultValue="0" /></label><label>既有投入<select name="contributionId"><option value="">不調整</option>{data.contributions.map((item) => <option key={item.id} value={item.id}>{item.id.slice(0, 8)}</option>)}</select></label><label>覆寫金額（TWD）<input name="contributionAmount" type="number" min="0" /></label><label>覆寫開始日期<input name="contributionStartDate" type="date" /></label><label>覆寫停止規則<select name="contributionEndRule"><option value="">不調整</option><option value="ownerRetirement">本人退休</option><option value="primaryRetirement">主要規劃人退休</option><option value="fixedDate">固定月份</option><option value="planEnd">規劃終點</option></select></label><label>固定停止月份<input name="contributionEndDate" type="month" /></label></div></details><details><summary>退休時間</summary><label>主要規劃人計畫退休月份<input name="plannedRetirementMonth" type="month" /></label></details><details><summary>投資報酬</summary><div className="form-grid three"><label>資產報酬覆寫<select name="assetId"><option value="">不調整</option>{data.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><label>保守／穩健／樂觀報酬（%）<input name="assetConservative" type="number" step="0.1" placeholder="保守" /><input name="assetBalanced" type="number" step="0.1" placeholder="穩健" /><input name="assetOptimistic" type="number" step="0.1" placeholder="樂觀" /></label></div></details><details><summary>資產配置</summary><fieldset><legend>立即再平衡目標（合計必須為 100%）</legend><div className="form-grid five">{([['stock', '股票'], ['bond', '債券'], ['moneyMarket', '貨幣市場'], ['cash', '現金'], ['other', '其他']] as const).map(([key, label]) => <label key={key}>{label}%<input name={`target-${key}`} type="number" min="0" max="100" step="0.1" /></label>)}</div></fieldset></details><details><summary>勞保／勞退</summary><div className="form-grid three"><label>勞退自提率（%）<input name="voluntaryRate" type="number" min="0" max="6" step="0.5" /></label><label>勞保請領年齡<input name="laborClaimAge" type="number" min="60" max="70" /></label><label>勞退請領年齡<input name="pensionClaimAge" type="number" min="60" max="70" /></label><label>勞退請領方式<select name="pensionClaimMode"><option value="">不調整</option><option value="lumpSum">一次領</option><option value="monthly">月領</option></select></label></div></details><details><summary>通膨</summary><label>通膨率（%）<input name="annualInflationRate" type="number" min="-99" max="100" step="0.1" /></label></details>{error && <div className="alert error" role="alert">{error}</div>}<div className="form-actions"><button className="button primary" type="submit"><Plus size={18} />暫存試算</button></div></form></section>
    <section className="panel"><h3>結果比較</h3>{!results ? <p role="status">正在計算情境…</p> : <div className="scenario-table-wrap"><table className="scenario-table"><thead><tr><th>方案</th>{([10, 15, 20, 25, 30, 35] as const).map((years) => <th key={years}>{years} 年後</th>)}<th>操作</th></tr></thead><tbody>{results.map((result) => <tr key={result.scenarioId}><th>{result.name}<small>{basisLabels[result.basis]}情境 · 名目金額／今天購買力</small>{result.warnings.map((warning) => <small key={warning}>{warning}</small>)}</th>{([10, 15, 20, 25, 30, 35] as const).map((years) => { const item = result.milestones.find((milestone) => milestone.years === years); return <td key={years} data-years={`${years} 年後`}>{item ? <><strong>{currency.format(Number(item.totalAssetsNominal))}</strong><small>今天購買力 {currency.format(Number(item.totalAssetsReal))}</small>{result.scenarioId !== 'baseline' && <small>差異 {Number(item.deltaNominalVsBaseline) === 0 ? '無差異' : `${Number(item.deltaNominalVsBaseline) > 0 ? '+' : ''}${currency.format(Number(item.deltaNominalVsBaseline))}`}</small>}</> : '—'}</td> })}<td>{result.scenarioId !== 'baseline' && result.scenarioId !== draft?.id && <button className="icon-button danger" aria-label={`刪除方案 ${result.name}`} onClick={() => void remove(result.scenarioId)}><Trash2 size={18} /></button>}</td></tr>)}</tbody></table></div>}</section>
  </div>
}
