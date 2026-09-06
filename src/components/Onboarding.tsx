import { useState, type FormEvent } from 'react'
import { ArrowRight, Database, ShieldCheck } from 'lucide-react'
import { createStarterData, type PlannerData } from '../application/planner-data'
import { QuickStartWizard } from './QuickStartWizard'

interface Props {
  onCreate: (data: PlannerData) => void | Promise<void>
  onLoadDemo: () => void | Promise<void>
  onEvent?: (event: 'quick_start_opened' | 'quick_start_completed' | 'demo_opened' | 'full_plan_started') => void
}

export function Onboarding({ onCreate, onLoadDemo, onEvent }: Props) {
  const today = new Date().toLocaleDateString('sv-SE')
  const [screen, setScreen] = useState<'home' | 'full' | 'quick'>('home')
  const [includePartner, setIncludePartner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const primaryBirthDate = String(form.get('primaryBirthDate') ?? '')
    const partnerBirthDate = String(form.get('partnerBirthDate') ?? '')
    if (primaryBirthDate > today || (includePartner && partnerBirthDate > today)) { setError('出生日期不可晚於今天。'); return }
    void onCreate(createStarterData({ householdName: `${String(form.get('primaryName'))}的資產計畫`, primaryName: String(form.get('primaryName')), primaryBirthDate, planningEndAge: 90, partnerName: includePartner ? String(form.get('partnerName')) : undefined, partnerBirthDate: includePartner ? partnerBirthDate : undefined, calculationBaseDate: today }))
  }
  if (screen === 'quick') return <QuickStartWizard onCancel={() => setScreen('home')} onComplete={(data) => { onEvent?.('quick_start_completed'); return onCreate(data) }} />
  return <main className="onboarding-shell">
    <section className="onboarding-intro"><span className="brand-mark large"><ShieldCheck size={30} aria-hidden="true" /></span><p className="eyebrow light">安心退休規劃</p><h1>看懂現在的資產，未來可能變成多少。</h1><p>看現在股票、債券與現金怎麼分配；比較未來 10～35 年三種情境；把未來金額換算成今天真正的購買力。</p><div className="trust-points"><span><Database size={18} aria-hidden="true" /> 財務資料留在你的瀏覽器，不需要註冊帳號</span><span><ShieldCheck size={18} aria-hidden="true" /> 可先快速試算，再逐步補完整退休資料</span></div></section>
    <section className="onboarding-card">
      {screen === 'home' ? <><div className="section-heading"><p className="eyebrow">從這裡開始</p><h2>選擇適合你的方式</h2><p>第一次使用不必先理解完整退休系統。</p></div><div className="onboarding-actions"><button className="choice-card primary-choice" type="button" aria-label="快速試算我的未來資產" onClick={() => { onEvent?.('quick_start_opened'); setScreen('quick') }}><strong>快速試算我的未來資產</strong><small>約 2～3 分鐘，只需要目前投資資產、每月投入與資產配置。</small><ArrowRight size={18} /></button><button className="choice-card" type="button" aria-label="建立完整退休規劃" onClick={() => { onEvent?.('full_plan_started'); setScreen('full') }}><strong>建立完整退休規劃</strong><small>加入家庭、收入支出、勞保勞退與退休生活費。</small><ArrowRight size={18} /></button><button className="choice-card" type="button" aria-label="先使用展示資料體驗" onClick={() => { onEvent?.('demo_opened'); void onLoadDemo() }}><strong>先看看範例</strong><small>不輸入自己的資料，直接看看結果長什麼樣子。</small><ArrowRight size={18} /></button></div></> : <><div className="section-heading"><button className="text-button back-link" type="button" onClick={() => setScreen('home')}>← 返回選擇</button><p className="eyebrow">完整規劃</p><h2>建立我的資產計畫</h2><p>先完成基本資料，其他內容都可以稍後補齊。</p></div><form onSubmit={submit} className="form-stack"><div className="form-grid two"><label>主要規劃人名稱<input name="primaryName" required autoComplete="name" /></label><label>出生日期<input name="primaryBirthDate" type="date" required max={today} /></label></div><label className="checkbox-row"><input type="checkbox" checked={includePartner} onChange={(event) => setIncludePartner(event.target.checked)} /><span>加入伴侶（資料可以稍後補充）</span></label>{includePartner && <div className="form-grid two inset-fields"><label>伴侶名稱<input name="partnerName" required /></label><label>伴侶出生日期<input name="partnerBirthDate" type="date" required max={today} /></label></div>}{error && <div className="field-error" role="alert">{error}</div>}<button className="button primary wide" type="submit">開始建立 <ArrowRight size={18} aria-hidden="true" /></button></form></>}
    </section>
  </main>
}
