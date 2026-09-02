import { useState, type FormEvent } from 'react'
import { PieChart, Save, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { PlannerData, PlannerPortfolio } from '../application/planner-data'
import type { RebalancingResult } from '../domain/rebalancing-engine'

interface Props { data: PlannerData; result: RebalancingResult | null; onChange: (data: PlannerData) => void | Promise<void> }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const labels: Record<string, string> = { cash: '現金', stockEtf: '股票／ETF', bond: '債券', fund: '基金', insurance: '保險', property: '不動產', retirementAccount: '退休專戶', other: '其他' }

export function PortfolioPage({ data, result, onChange }: Props) {
  const portfolio = data.portfolios[0]
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const investable = data.assets.filter((asset) => !['property', 'insurance', 'retirementAccount'].includes(asset.assetType))

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const assetIds = investable.filter((asset) => form.get(`asset-${asset.id}`) === 'on').map((asset) => asset.id)
    const targets = ['stockEtf', 'bond', 'cash', 'fund', 'other'].map((assetClass) => ({ assetClass: assetClass as PlannerPortfolio['targets'][number]['assetClass'], targetWeight: (Number(form.get(`target-${assetClass}`)) / 100).toString() })).filter((target) => Number(target.targetWeight) > 0)
    if (Math.abs(targets.reduce((sum, target) => sum + Number(target.targetWeight), 0) - 1) > 0.000001) { setError('目標配置合計必須等於 100%。'); return }
    const now = new Date().toISOString()
    const next: PlannerPortfolio = { id: portfolio?.id ?? crypto.randomUUID(), householdId: data.household.id, name: String(form.get('name')), scope: 'household', assetIds, targets, driftThreshold: (Number(form.get('driftThreshold')) / 100).toString(), createdAt: portfolio?.createdAt ?? now, updatedAt: now }
    await onChange({ ...data, portfolios: portfolio ? [next, ...data.portfolios.slice(1)] : [next] })
    setError(null); setMessage('投資組合設定已儲存並重新計算。')
  }

  return <div className="page-stack">
    <section className="panel"><div className="panel-heading"><div><h2><PieChart size={21} /> 投資組合與再平衡</h2><p>只比較可投資資產與自訂目標；房屋、保險及勞退不會自動納入，也不產生個別證券買賣建議。</p></div></div>{message && <div className="alert success" role="status">{message}</div>}</section>
    <section className="panel"><form className="settings-form" onSubmit={save}><label>投資組合名稱<input name="name" required defaultValue={portfolio?.name ?? '家庭可投資資產'} /></label><fieldset><legend>納入範圍</legend><div className="member-grid">{investable.map((asset) => <label className="checkbox-row" key={asset.id}><input type="checkbox" name={`asset-${asset.id}`} defaultChecked={portfolio?.assetIds.includes(asset.id)} /><span>{asset.name} · {labels[asset.assetType]}</span></label>)}</div>{investable.length === 0 && <p className="muted">尚無可投資資產；可先在家庭資料新增。</p>}</fieldset><fieldset><legend>目標配置</legend><div className="form-grid three">{['stockEtf', 'bond', 'cash', 'fund', 'other'].map((assetClass) => <label key={assetClass}>{labels[assetClass]}（%）<input name={`target-${assetClass}`} type="number" min="0" max="100" step="0.1" defaultValue={Number(portfolio?.targets.find((item) => item.assetClass === assetClass)?.targetWeight ?? 0) * 100} /></label>)}<label>允許偏離（百分點）<input name="driftThreshold" type="number" min="0" max="100" step="0.1" required defaultValue={Number(portfolio?.driftThreshold ?? .05) * 100} /></label></div></fieldset>{error && <div className="alert error" role="alert">{error}</div>}<div className="form-actions"><button className="button primary" type="submit"><Save size={18} />儲存投資組合</button></div></form></section>
    <section className="panel"><div className="panel-heading"><div><h3>目前配置與偏離</h3><p>實際配置由納入資產的最新有效市值衍生，不重複保存。</p></div><small>{result?.status === 'balanced' ? '配置在範圍內' : result?.status === 'reviewNeeded' ? '建議檢視配置' : '尚無可計算資產'}</small></div>{result?.allocations.length ? <div className="allocation-list">{result.allocations.map((item) => <article key={item.assetClass}><div><strong>{labels[item.assetClass] ?? item.assetClass}</strong><span>{currency.format(Number(item.valueTwd))}</span></div><div className="allocation-bar" aria-label={`${labels[item.assetClass] ?? item.assetClass}目前 ${(Number(item.currentWeight) * 100).toFixed(1)}%`}><span style={{ width: `${Math.min(100, Number(item.currentWeight) * 100)}%` }} /></div><small>目前 {(Number(item.currentWeight) * 100).toFixed(1)}% · 目標 {(Number(item.targetWeight) * 100).toFixed(1)}% · 偏離 {(Number(item.drift) * 100).toFixed(1)} 個百分點</small></article>)}</div> : <div className="empty-state">尚無可計算配置。</div>}{result?.warnings.map((warning) => <div className="message warning" key={warning}><TriangleAlert size={18} />{warning}</div>)}{result?.status === 'balanced' && <div className="alert success"><ShieldCheck size={18} />所有配置均在允許偏離範圍內。</div>}</section>
  </div>
}
