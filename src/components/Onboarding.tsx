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
    const partnerBirthDate = String(form.get('partnerBirthDate') ?? '')
    if (primaryBirthDate > today || (includePartner && partnerBirthDate > today)) {
      setError('出生日期不可晚於今天。')
      return
    }
    void onCreate(createStarterData({
      householdName: `${String(form.get('primaryName'))}的資產計畫`,
      primaryName: String(form.get('primaryName')),
      primaryBirthDate,
      planningEndAge: 90,
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
        <h1>看看現在的資產，未來可能累積多少。</h1>
        <p>看懂投資如何分配，比較未來 10～35 年的三種情境，再換算成今天的購買力。勞退與勞保也能另外記錄。</p>
        <div className="trust-points">
          <span><Database size={18} aria-hidden="true" /> 財務資料儲存在你的瀏覽器</span>
          <span><ShieldCheck size={18} aria-hidden="true" /> 資產與投入計畫可以稍後補齊</span>
        </div>
      </section>

      <section className="onboarding-card">
        <div className="section-heading">
          <p className="eyebrow">第一步</p>
          <h2>建立我的資產計畫</h2>
          <p>只需要基本資料，約一分鐘完成。</p>
        </div>
        <form onSubmit={submit} className="form-stack">
          <div className="form-grid two">
            <label>主要規劃人名稱<input name="primaryName" required autoComplete="name" /></label>
            <label>出生日期<input name="primaryBirthDate" type="date" required max={today} /></label>
          </div>
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
