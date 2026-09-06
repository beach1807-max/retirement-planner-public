import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { createQuickStartData, type AllocationClass } from '../application/quick-start'
import type { PlannerData } from '../application/planner-data'

interface Props { onComplete: (data: PlannerData) => void | Promise<void>; onCancel: () => void }

const fields: Array<{ key: AllocationClass; label: string }> = [
  { key: 'stock', label: '股票' }, { key: 'bond', label: '債券' }, { key: 'moneyMarket', label: '貨幣市場' }, { key: 'cash', label: '現金' }, { key: 'other', label: '其他' },
]

export function QuickStartWizard({ onComplete, onCancel }: Props) {
  const today = new Date().toLocaleDateString('sv-SE')
  const [step, setStep] = useState(1)
  const [birthDate, setBirthDate] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [assets, setAssets] = useState('')
  const [monthly, setMonthly] = useState('')
  const [allocations, setAllocations] = useState<Record<AllocationClass, string>>({ stock: '', bond: '', moneyMarket: '', cash: '', other: '' })
  const [error, setError] = useState<string | null>(null)
  const allocationTotal = fields.reduce((sum, field) => sum + (Number(allocations[field.key]) || 0), 0)

  function next() {
    if (step === 1 && (!birthDate || birthDate > today)) { setError('請輸入今天或更早的出生日期。'); return }
    if (step === 2 && (!/^\d+$/.test(assets) || !/^\d+$/.test(monthly))) { setError('資產與每月投入請輸入 0 以上的整數金額。'); return }
    setError(null)
    setStep((value) => value + 1)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const data = createQuickStartData({ birthDate, displayName, totalInvestableAssetsTwd: assets, monthlyContributionTwd: monthly, allocations, calculationBaseDate: today })
      void onComplete(data)
    } catch {
      setError('請確認所有金額與配置；五項配置合計必須剛好為 100%。')
    }
  }

  return <main className="onboarding-shell">
    <section className="onboarding-intro"><p className="eyebrow light">快速試算</p><h1>快速看懂未來資產。</h1><p>只需目前投資資產、每月投入與資產配置。資料只會儲存在這台裝置的瀏覽器。</p></section>
    <section className="onboarding-card">
      <p className="eyebrow">第 {step}／3 步</p>
      <form className="form-stack" onSubmit={submit}>
        {step === 1 && <><div className="section-heading"><h2>先認識你的規劃</h2><p>出生日期用來在完整規劃時接續設定，這一步不會要求收入或退休制度資料。</p></div><label>出生日期<input aria-label="出生日期" type="date" value={birthDate} max={today} required onChange={(event) => setBirthDate(event.target.value)} /></label><label>顯示名稱（選填）<input aria-label="顯示名稱" value={displayName} placeholder="我的退休規劃" onChange={(event) => setDisplayName(event.target.value)} /></label></>}
        {step === 2 && <><div className="section-heading"><h2>目前可投入多少？</h2><p>只填可用於投資的資產；不必填收入、支出、房貸、勞保或勞退。</p></div><label>目前可投資資產總額（TWD）<input aria-label="目前可投資資產總額（TWD）" type="number" min="0" step="1" inputMode="numeric" value={assets} required onChange={(event) => setAssets(event.target.value)} /></label><label>每月預計投入金額（TWD）<input aria-label="每月預計投入金額（TWD）" type="number" min="0" step="1" inputMode="numeric" value={monthly} required onChange={(event) => setMonthly(event.target.value)} /></label></>}
        {step === 3 && <><div className="section-heading"><h2>目前資產怎麼分配？</h2><p>可填 0%，但五項合計必須剛好為 100%。</p></div><div className="form-grid two">{fields.map((field) => <label key={field.key}>{field.label}（%）<input aria-label={`${field.label}（%）`} type="number" min="0" max="100" step="1" inputMode="decimal" value={allocations[field.key]} onChange={(event) => setAllocations((value) => ({ ...value, [field.key]: event.target.value }))} /></label>)}</div><div className={allocationTotal === 100 ? 'alert success' : 'alert error'} role={allocationTotal === 100 ? 'status' : 'alert'}>目前合計：{allocationTotal}% {allocationTotal < 100 ? `｜還差：${100 - allocationTotal}%` : allocationTotal > 100 ? `｜超過：${allocationTotal - 100}%` : '｜配置完成'}</div></>}
        {error && <div className="field-error" role="alert">{error}</div>}
        <div className="form-actions"><button className="button ghost" type="button" onClick={step === 1 ? onCancel : () => { setError(null); setStep((value) => value - 1) }}>{step === 1 ? '返回入口' : <><ArrowLeft size={18} /> 上一步</>}</button>{step < 3 ? <button className="button primary" type="button" onClick={next}>下一步 <ArrowRight size={18} /></button> : <button className="button primary" type="submit" disabled={allocationTotal !== 100}><CheckCircle2 size={18} /> 開始查看結果</button>}</div>
      </form>
    </section>
  </main>
}
