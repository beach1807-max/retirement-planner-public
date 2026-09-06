import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import type { PlannerData, PlannerMember } from '../application/planner-data'

interface Props { data: PlannerData; onChange: (data: PlannerData) => void | Promise<void> }
const roleLabel = { primary: '主要規劃人', partner: '伴侶', other: '其他成員' }

export function MemberManagement({ data, onChange }: Props) {
  const [editor, setEditor] = useState<string | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const edited = editor && editor !== 'new' ? data.members.find((member) => member.id === editor) : undefined
  const primary = data.members.find((member) => member.role === 'primary')!
  const isReferenced = (memberId: string) => data.assets.some((item) => item.ownerMemberId === memberId || item.owners?.some((owner) => owner.memberId === memberId)) || data.accounts.some((item) => item.ownerMemberId === memberId || item.owners?.some((owner) => owner.memberId === memberId)) || data.incomes.some((item) => item.ownerMemberId === memberId || item.owners?.some((owner) => owner.memberId === memberId)) || data.expenses.some((item) => item.ownerMemberId === memberId || item.owners?.some((owner) => owner.memberId === memberId)) || data.liabilities.some((item) => item.ownerMemberId === memberId || item.owners?.some((owner) => owner.memberId === memberId)) || data.contributions.some((item) => item.sourceMemberId === memberId) || data.retirementSystems.some((item) => item.memberId === memberId)

  function start(member?: PlannerMember) { setEditor(member?.id ?? 'new'); setError(null) }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const role = String(form.get('role')) as PlannerMember['role']
    if (role === 'primary' && data.members.some((member) => member.id !== edited?.id && member.role === 'primary')) { setError('家庭中必須且只能有一位主要規劃人。'); return }
    if (role === 'partner' && data.members.some((member) => member.id !== edited?.id && member.role === 'partner')) { setError('目前僅支援一位伴侶。'); return }
    const now = new Date().toISOString()
    const member: PlannerMember = { id: edited?.id ?? crypto.randomUUID(), householdId: data.household.id, name: String(form.get('name')), role, birthDate: String(form.get('birthDate')), planningEndAge: Number(form.get('planningEndAge')), plannedRetirementMonth: String(form.get('plannedRetirementMonth')) || undefined, isActive: true, createdAt: edited?.createdAt ?? now, updatedAt: now }
    const members = edited ? data.members.map((item) => item.id === member.id ? member : item) : [...data.members, member]
    const primary = members.find((item) => item.role === 'primary')
    if (!primary) { setError('請保留一位主要規劃人。'); return }
    void onChange({ ...data, members, household: { ...data.household, primaryMemberId: primary.id, updatedAt: now } })
    setEditor(null)
  }
  function remove(member: PlannerMember) {
    if (member.role === 'primary') { setError('主要規劃人不可刪除。'); return }
    if (isReferenced(member.id)) { setError(`無法刪除「${member.name}」：仍被資產、帳戶、收支、負債、投入或退休制度資料引用。`); return }
    void onChange({ ...data, members: data.members.filter((item) => item.id !== member.id) })
  }

  return <section className="panel"><div className="panel-heading"><div><h2><Users size={21} /> 家庭成員</h2><p>主要規劃人恰一位、伴侶最多一位；其他成員可依需要新增。</p></div><button className="button secondary" onClick={() => start()}><Plus size={18} /> 新增成員</button></div>
    {editor && <form className="editor-form" onSubmit={save}><div className="form-grid three"><label>姓名<input name="name" required defaultValue={edited?.name} /></label><label>角色<select name="role" defaultValue={edited?.role ?? 'other'} disabled={edited?.role === 'primary'}><option value="primary">主要規劃人</option><option value="partner" disabled={data.members.some((member) => member.id !== edited?.id && member.role === 'partner')}>伴侶</option><option value="other">其他成員</option></select></label><label>出生日期<input name="birthDate" type="date" required defaultValue={edited?.birthDate} /></label><label>預計退休月份<input name="plannedRetirementMonth" type="month" defaultValue={edited?.plannedRetirementMonth} /></label><label>規劃終點年齡<input name="planningEndAge" type="number" min="70" max="120" required defaultValue={edited?.planningEndAge ?? primary.planningEndAge} /></label></div>{error && <div className="field-error" role="alert">{error}</div>}<div className="form-actions"><button type="button" className="button ghost" onClick={() => setEditor(null)}>取消</button><button className="button primary" type="submit">儲存成員</button></div></form>}
    {error && !editor && <div className="field-error" role="alert">{error}</div>}<div className="member-grid">{data.members.map((member) => <article className="member-card" key={member.id}><span className="avatar">{member.name.slice(0, 1)}</span><div><strong>{member.name}</strong><p>{roleLabel[member.role]} · {member.birthDate} · {member.plannedRetirementMonth ?? '未設定退休月份'}</p></div><button className="icon-button" aria-label={`編輯 ${member.name}`} onClick={() => start(member)}><Pencil size={18} /></button>{member.role !== 'primary' && <button className="icon-button danger" aria-label={`刪除 ${member.name}`} onClick={() => remove(member)}><Trash2 size={18} /></button>}</article>)}</div>
  </section>
}
