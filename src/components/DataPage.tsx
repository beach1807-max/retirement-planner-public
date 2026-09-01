import { useState, type FormEvent } from 'react'
import { Plus, Trash2, Users, WalletCards } from 'lucide-react'
import type { PlannerData } from '../application/planner-data'
import type { Asset, Contribution } from '../domain/models'

interface Props { data: PlannerData; onChange: (data: PlannerData) => void | Promise<void> }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })

export function DataPage({ data, onChange }: Props) {
  const [assetOpen, setAssetOpen] = useState(data.assets.length === 0)
  const [contributionOpen, setContributionOpen] = useState(false)

  function addAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const ownershipType = String(form.get('ownershipType')) as Asset['ownershipType']
    const ownerMemberId = String(form.get('ownerMemberId'))
    const asset: Asset = {
      id: crypto.randomUUID(), householdId: data.household.id, name: String(form.get('name')),
      assetType: String(form.get('assetType')) as Asset['assetType'], ownershipType,
      ownerMemberId: ownershipType === 'individual' ? ownerMemberId : undefined,
      owners: ownershipType === 'joint' ? data.members.slice(0, 2).map((member) => ({ memberId: member.id, share: data.members.length > 1 ? '0.5' : '1' })) : undefined,
      currentValueTwd: String(form.get('currentValueTwd')), includeInTotalAssets: true,
      retirementUsageScope: String(form.get('retirementUsageScope')) as Asset['retirementUsageScope'],
      availableFrom: String(form.get('availableFrom')), returnProfileId: String(form.get('returnProfileId')), status: 'provided',
    }
    void onChange({ ...data, assets: [...data.assets, asset] })
    event.currentTarget.reset()
    setAssetOpen(false)
  }

  function addContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const contribution: Contribution = {
      id: crypto.randomUUID(), householdId: data.household.id, sourceMemberId: String(form.get('sourceMemberId')),
      amountTwd: String(form.get('amountTwd')), usageScope: 'household', startDate: String(form.get('startDate')),
      endRule: String(form.get('endRule')) as Contribution['endRule'], destinationAssetId: String(form.get('destinationAssetId')),
      status: 'provided',
    }
    void onChange({ ...data, contributions: [...data.contributions, contribution] })
    event.currentTarget.reset()
    setContributionOpen(false)
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading"><div><h2><Users size={21} /> 家庭成員</h2><p>主要規劃人與伴侶使用相同資料模型，伴侶資料不需要一次填完。</p></div></div>
        <div className="member-grid">
          {data.members.map((member) => (
            <article className="member-card" key={member.id}>
              <span className="avatar">{member.name.slice(0, 1)}</span>
              <div><strong>{member.name}</strong><p>{member.role === 'primary' ? '主要規劃人' : member.role === 'partner' ? '伴侶' : '其他成員'} · {member.birthDate}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><h2><WalletCards size={21} /> 退休資產</h2><p>第一版支援現金、股票／ETF 與其他資產，金額以新臺幣輸入。</p></div>
          <button className="button secondary" onClick={() => setAssetOpen((open) => !open)}><Plus size={18} /> 新增資產</button>
        </div>
        {assetOpen && (
          <form className="editor-form" onSubmit={addAsset}>
            <div className="form-grid three">
              <label>資產名稱<input name="name" required /></label>
              <label>類型<select name="assetType"><option value="cash">現金</option><option value="stockEtf">股票／ETF</option><option value="other">其他</option></select></label>
              <label>目前價值（TWD）<input name="currentValueTwd" type="number" required min="0" step="1" /></label>
              <label>所有權<select name="ownershipType"><option value="individual">個人</option><option value="joint" disabled={data.members.length < 2}>共同持有</option><option value="household">家庭層級</option></select></label>
              <label>所屬成員<select name="ownerMemberId">{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
              <label>退休使用範圍<select name="retirementUsageScope"><option value="personal">所屬成員個人</option><option value="household">家庭退休可用</option><option value="excluded">不納入退休</option></select></label>
              <label>可動用日期<input name="availableFrom" type="date" required defaultValue={data.calculationBaseDate} /></label>
              <label>報酬設定<select name="returnProfileId">{data.assumptions.returnProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
            </div>
            <div className="form-actions"><button className="button ghost" type="button" onClick={() => setAssetOpen(false)}>取消</button><button className="button primary" type="submit">儲存資產</button></div>
          </form>
        )}
        <div className="data-list">
          {data.assets.map((asset) => (
            <article key={asset.id}>
              <div><strong>{asset.name}</strong><p>{asset.assetType === 'stockEtf' ? '股票／ETF' : asset.assetType === 'cash' ? '現金' : '其他'} · {asset.retirementUsageScope === 'household' ? '家庭退休可用' : asset.retirementUsageScope === 'personal' ? '個人退休使用' : '已排除'}</p></div>
              <strong>{currency.format(Number(asset.currentValueTwd))}</strong>
              <select
                className="compact-select"
                aria-label={`${asset.name} 退休使用範圍`}
                value={asset.retirementUsageScope}
                onChange={(event) => void onChange({ ...data, assets: data.assets.map((item) => item.id === asset.id ? { ...item, retirementUsageScope: event.target.value as Asset['retirementUsageScope'] } : item) })}
              >
                <option value="personal">個人使用</option>
                <option value="household">家庭可用</option>
                <option value="excluded">排除</option>
              </select>
              <button className="icon-button danger" aria-label={`刪除 ${asset.name}`} onClick={() => void onChange({ ...data, assets: data.assets.filter((item) => item.id !== asset.id), contributions: data.contributions.filter((item) => item.destinationAssetId !== asset.id) })}><Trash2 size={18} /></button>
            </article>
          ))}
          {data.assets.length === 0 && <div className="empty-state">尚未建立資產。至少加入一筆資產或明確的 0 元起始資產。</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><h2>每月可投入資金</h2><p>投入必須指定目的資產，退休月份的投入會依結束規則停止。</p></div>
          <button className="button secondary" disabled={data.assets.length === 0} onClick={() => setContributionOpen((open) => !open)}><Plus size={18} /> 新增投入</button>
        </div>
        {contributionOpen && (
          <form className="editor-form" onSubmit={addContribution}>
            <div className="form-grid three">
              <label>來源成員<select name="sourceMemberId">{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
              <label>每月金額<input name="amountTwd" type="number" min="0" required /></label>
              <label>開始日期<input name="startDate" type="date" required defaultValue={data.calculationBaseDate} /></label>
              <label>停止規則<select name="endRule"><option value="ownerRetirement">來源成員退休時</option><option value="primaryRetirement">主要規劃人退休時</option><option value="planEnd">持續至規劃終點</option></select></label>
              <label>投入目的資產<select name="destinationAssetId">{data.assets.filter((asset) => asset.retirementUsageScope !== 'excluded').map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
            </div>
            <div className="form-actions"><button className="button ghost" type="button" onClick={() => setContributionOpen(false)}>取消</button><button className="button primary" type="submit">儲存投入</button></div>
          </form>
        )}
        <div className="data-list">
          {data.contributions.map((contribution) => {
            const member = data.members.find((item) => item.id === contribution.sourceMemberId)
            const asset = data.assets.find((item) => item.id === contribution.destinationAssetId)
            return <article key={contribution.id}><div><strong>{member?.name} 每月投入</strong><p>投向 {asset?.name} · {contribution.endRule === 'ownerRetirement' ? '本人退休時停止' : contribution.endRule === 'primaryRetirement' ? '主要規劃人退休時停止' : '持續至規劃終點'}</p></div><strong>{currency.format(Number(contribution.amountTwd))}</strong><button className="icon-button danger" aria-label="刪除每月投入" onClick={() => void onChange({ ...data, contributions: data.contributions.filter((item) => item.id !== contribution.id) })}><Trash2 size={18} /></button></article>
          })}
          {data.contributions.length === 0 && <div className="empty-state">目前沒有每月投入；這不會阻止使用現有資產進行試算。</div>}
        </div>
      </section>
    </div>
  )
}
