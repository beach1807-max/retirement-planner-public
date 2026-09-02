import { useState, type FormEvent } from 'react'
import { ArrowRight, Database, ShieldCheck } from 'lucide-react'
import { createStarterData, type PlannerData } from '../application/planner-data'

interface Props {
  onCreate: (data: PlannerData) => void | Promise<void>
  onLoadDemo: () => void | Promise<void>
}

export function Onboarding({ onCreate, onLoadDemo }: Props) {
  const today = new Date().toLocaleDateString('sv-SE')
  const [includePartner, setIncludePartner] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const primaryBirthDate = String(form.get('primaryBirthDate') ?? '')
    const primaryPlannedRetirementMonth = String(form.get('primaryPlannedRetirementMonth') ?? '')
    const partnerBirthDate = String(form.get('partnerBirthDate') ?? '')
    if (primaryBirthDate > today || (includePartner && partnerBirthDate > today)) {
      setError('出生日期不可晚於今天。')
      return
    }
    void onCreate(createStarterData({
      householdName: String(form.get('householdName')),
      primaryName: String(form.get('primaryName')),
      primaryBirthDate,
      primaryPlannedRetirementMonth,
      planningEndAge: Number(form.get('planningEndAge')),
      partnerName: includePartner ? String(form.get('partnerName')) : undefined,
      partnerBirthDate: includePartner ? partnerBirthDate : undefined,
      calculationBaseDate: today,
    }))
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-intro">
        <span className="brand-mark large"><ShieldCheck size={30} aria-hidden="true" /></span>
        <p className="eyebrow light">個人與家庭退休資產規劃</p>
        <h1>把「何時能退休」變成一條看得懂的時間線。</h1>
        <p>先建立主要規劃人，其他資產與伴侶資料都可以稍後逐項加入。</p>
        <div className="trust-points">
          <span><Database size={18} aria-hidden="true" /> 財務資料儲存在你的瀏覽器</span>
          <span><ShieldCheck size={18} aria-hidden="true" /> 計算結果可逐月追溯</span>
        </div>
      </section>

      <section className="onboarding-card">
        <div className="section-heading">
          <p className="eyebrow">第一步</p>
          <h2>建立退休計畫</h2>
          <p>只需要基本資料，約一分鐘完成。</p>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>家庭／計畫名稱<input name="householdName" required defaultValue="我的退休計畫" /></label>
          <div className="form-grid two">
            <label>主要規劃人名稱<input name="primaryName" required autoComplete="name" /></label>
            <label>出生日期<input name="primaryBirthDate" type="date" required max={today} /></label>
            <label>預計退休月份<input name="primaryPlannedRetirementMonth" type="month" required min={today.slice(0, 7)} defaultValue={`${Number(today.slice(0, 4)) + 24}-${today.slice(5, 7)}`} /></label>
          </div>
          <label>希望規劃到幾歲<input name="planningEndAge" type="number" required min="70" max="120" defaultValue="90" /></label>
          <label className="checkbox-row">
            <input type="checkbox" checked={includePartner} onChange={(event) => setIncludePartner(event.target.checked)} />
            <span>加入伴侶（資料可以稍後補充）</span>
          </label>
          {includePartner && (
            <div className="form-grid two inset-fields">
              <label>伴侶名稱<input name="partnerName" required /></label>
              <label>伴侶出生日期<input name="partnerBirthDate" type="date" required max={today} /></label>
            </div>
          )}
          {error && <div className="field-error" role="alert">{error}</div>}
          <button className="button primary wide" type="submit">開始建立 <ArrowRight size={18} aria-hidden="true" /></button>
        </form>
        <button className="text-button" type="button" onClick={() => void onLoadDemo()}>先使用展示資料體驗</button>
      </section>
    </main>
  )
}
