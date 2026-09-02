import Decimal from 'decimal.js'
import { useState, type FormEvent } from 'react'
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import type { OwnershipFields, PlannerAccount, PlannerData, PlannerExpense, PlannerHolding, PlannerIncome, PlannerLiability } from '../application/planner-data'

interface Props { data: PlannerData; onChange: (data: PlannerData) => void | Promise<void> }
type Kind = 'account' | 'holding' | 'income' | 'expense' | 'liability'
type Item = PlannerAccount | PlannerHolding | PlannerIncome | PlannerExpense | PlannerLiability
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const labels: Record<Kind, string> = { account: '帳戶', holding: '持有部位', income: '收入', expense: '平均支出', liability: '負債' }

export function FinancialDataSections({ data, onChange }: Props) {
  const [editor, setEditor] = useState<{ kind: Kind; id: string | 'new' } | null>(null)
  const [ownershipType, setOwnershipType] = useState<OwnershipFields['ownershipType']>('individual')
  const [error, setError] = useState<string | null>(null)
  const listFor = (kind: Kind): Item[] => kind === 'account' ? data.accounts : kind === 'holding' ? data.holdings : kind === 'income' ? data.incomes : kind === 'expense' ? data.expenses : data.liabilities
  const edited = editor?.id && editor.id !== 'new' ? listFor(editor.kind).find((item) => item.id === editor.id) : undefined

  function open(kind: Kind, item?: Item) {
    setEditor({ kind, id: item?.id ?? 'new' })
    setOwnershipType(item && 'ownershipType' in item ? item.ownershipType : kind === 'expense' || kind === 'liability' ? 'household' : 'individual')
    setError(null)
  }

  function ownership(form: FormData): OwnershipFields | null {
    if (ownershipType === 'household') return { ownershipType }
    if (ownershipType === 'individual') return { ownershipType, ownerMemberId: String(form.get('ownerMemberId')) }
    const owners = data.members.flatMap((member) => { const value = String(form.get(`ownerShare-${member.id}`) ?? ''); return Number(value) > 0 ? [{ memberId: member.id, share: new Decimal(value).div(100).toString() }] : [] })
    if (owners.length < 2 || !owners.reduce((sum, owner) => sum.plus(owner.share), new Decimal(0)).eq(1)) { setError('共同歸屬至少需要兩位成員，且持分合計必須等於 100%。'); return null }
    return { ownershipType, owners }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const form = new FormData(event.currentTarget)
    const now = new Date().toISOString()
    const base = { id: edited?.id ?? crypto.randomUUID(), householdId: data.household.id, status: String(form.get('status')) as 'provided' | 'notProvided' | 'notApplicable', createdAt: edited?.createdAt ?? now, updatedAt: now }
    if (editor.kind === 'holding') {
      const item: PlannerHolding = { ...base, accountId: String(form.get('accountId')), assetId: String(form.get('assetId')), quantity: String(form.get('quantity')) }
      void onChange({ ...data, holdings: edited ? data.holdings.map((value) => value.id === item.id ? item : value) : [...data.holdings, item] })
    } else {
      const owner = ownership(form)
      if (!owner) return
      const common = { ...base, ...owner, name: String(form.get('name')) }
      if (editor.kind === 'account') {
        const item: PlannerAccount = { ...common, institution: String(form.get('institution')) || undefined, accountType: String(form.get('accountType')) as PlannerAccount['accountType'] }
        void onChange({ ...data, accounts: edited ? data.accounts.map((value) => value.id === item.id ? item : value) : [...data.accounts, item] })
      } else if (editor.kind === 'income') {
        const item: PlannerIncome = { ...common, incomeType: String(form.get('incomeType')) as PlannerIncome['incomeType'], monthlyAmount: { amount: String(form.get('amount')), currency: 'TWD' }, annualGrowthRate: new Decimal(String(form.get('growthPercent')) || 0).div(100).toString() }
        void onChange({ ...data, incomes: edited ? data.incomes.map((value) => value.id === item.id ? item : value) : [...data.incomes, item] })
      } else if (editor.kind === 'expense') {
        const item: PlannerExpense = { ...common, monthlyAmount: { amount: String(form.get('amount')), currency: 'TWD' } }
        void onChange({ ...data, expenses: edited ? data.expenses.map((value) => value.id === item.id ? item : value) : [...data.expenses, item] })
      } else {
        const item: PlannerLiability = { ...common, liabilityType: String(form.get('liabilityType')) as PlannerLiability['liabilityType'], currentBalance: { amount: String(form.get('amount')), currency: 'TWD' }, monthlyPayment: { amount: String(form.get('monthlyPayment')), currency: 'TWD' } }
        void onChange({ ...data, liabilities: edited ? data.liabilities.map((value) => value.id === item.id ? item : value) : [...data.liabilities, item] })
      }
    }
    setEditor(null); setError(null)
  }

  function remove(kind: Kind, id: string) {
    if (kind === 'account') void onChange({ ...data, accounts: data.accounts.filter((item) => item.id !== id), holdings: data.holdings.filter((item) => item.accountId !== id), assets: data.assets.map((asset) => asset.accountId === id ? { ...asset, accountId: undefined } : asset) })
    if (kind === 'holding') void onChange({ ...data, holdings: data.holdings.filter((item) => item.id !== id) })
    if (kind === 'income') void onChange({ ...data, incomes: data.incomes.filter((item) => item.id !== id) })
    if (kind === 'expense') void onChange({ ...data, expenses: data.expenses.filter((item) => item.id !== id) })
    if (kind === 'liability') void onChange({ ...data, liabilities: data.liabilities.filter((item) => item.id !== id) })
  }

  function ownershipInputs() {
    if (!editor || editor.kind === 'holding') return null
    const item = edited && 'ownershipType' in edited ? edited : undefined
    return <>
      <label>歸屬<select name="ownershipType" value={ownershipType} onChange={(event) => setOwnershipType(event.target.value as OwnershipFields['ownershipType'])}><option value="individual">個人</option><option value="joint" disabled={data.members.length < 2}>共同</option><option value="household">家庭層級</option></select></label>
      {ownershipType === 'individual' && <label>所屬成員<select name="ownerMemberId" defaultValue={item?.ownerMemberId}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
      {ownershipType === 'joint' && data.members.map((member) => <label key={member.id}>{member.name} 持分（%）<input name={`ownerShare-${member.id}`} type="number" min="0" max="100" step="0.01" defaultValue={Number(item?.owners?.find((owner) => owner.memberId === member.id)?.share ?? 0) * 100 || undefined} /></label>)}
    </>
  }

  function amount(item: Item) {
    if ('monthlyAmount' in item) return currency.format(Number(item.monthlyAmount.amount)) + '／月'
    if ('currentBalance' in item) return currency.format(Number(item.currentBalance.amount))
    if ('quantity' in item) return `${item.quantity} 單位`
    return item.institution ?? item.accountType
  }

  const editedIncome = editor?.kind === 'income' ? edited as PlannerIncome | undefined : undefined

  return <section className="panel">
    <div className="panel-heading"><div><h2><Landmark size={21} /> 收支、負債與帳戶</h2><p>收入不會自動視為可投入金額；這裡保存家庭財務基礎與資料完整度。</p></div></div>
    <div className="action-row">{(['income', 'expense', 'liability', 'account', 'holding'] as Kind[]).map((kind) => <button key={kind} className="button secondary small" disabled={kind === 'holding' && (data.accounts.length === 0 || data.assets.length === 0)} onClick={() => open(kind)}><Plus size={16} /> {labels[kind]}</button>)}</div>
    {editor && <form key={`${editor.kind}-${editor.id}`} className="editor-form" onSubmit={save}>
      <h3>{editor.id === 'new' ? '新增' : '編輯'}{labels[editor.kind]}</h3><div className="form-grid three">
        {editor.kind !== 'holding' && <label>名稱<input name="name" required defaultValue={edited && 'name' in edited ? edited.name : ''} /></label>}
        <label>資料狀態<select name="status" defaultValue={edited?.status ?? 'provided'}><option value="provided">已提供</option><option value="notProvided">未提供</option><option value="notApplicable">不適用</option></select></label>
        {editor.kind === 'account' && <><label>機構<input name="institution" defaultValue={edited && 'institution' in edited ? edited.institution : ''} /></label><label>帳戶類型<select name="accountType" defaultValue={edited && 'accountType' in edited ? edited.accountType : 'bank'}><option value="cash">現金</option><option value="bank">銀行</option><option value="brokerage">證券</option><option value="insurance">保險</option><option value="property">不動產</option><option value="retirement">退休帳戶</option><option value="other">其他</option></select></label></>}
        {editor.kind === 'income' && <><label>收入類型<select name="incomeType" defaultValue={editedIncome?.incomeType ?? 'salary'}><option value="salary">薪資</option><option value="otherFixed">其他固定收入</option></select></label><label>每月金額（TWD）<input name="amount" type="number" min="0" required defaultValue={editedIncome?.monthlyAmount.amount ?? ''} /></label><label>年成長率（%）<input name="growthPercent" type="number" step="0.1" defaultValue={editedIncome ? Number(editedIncome.annualGrowthRate) * 100 : 0} /></label></>}
        {editor.kind === 'expense' && <label>每月平均金額（TWD）<input name="amount" type="number" min="0" required defaultValue={edited && 'monthlyAmount' in edited ? edited.monthlyAmount.amount : ''} /></label>}
        {editor.kind === 'liability' && <><label>負債類型<select name="liabilityType" defaultValue={edited && 'liabilityType' in edited ? edited.liabilityType : 'mortgage'}><option value="mortgage">房貸</option><option value="personalLoan">信貸</option><option value="carLoan">車貸</option><option value="other">其他</option></select></label><label>目前餘額（TWD）<input name="amount" type="number" min="0" required defaultValue={edited && 'currentBalance' in edited ? edited.currentBalance.amount : ''} /></label><label>每月還款（TWD）<input name="monthlyPayment" type="number" min="0" required defaultValue={edited && 'monthlyPayment' in edited ? edited.monthlyPayment.amount : ''} /></label></>}
        {editor.kind === 'holding' && <><label>帳戶<select name="accountId" defaultValue={edited && 'accountId' in edited ? edited.accountId : ''}>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>資產<select name="assetId" defaultValue={edited && 'assetId' in edited ? edited.assetId : ''}>{data.assets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>持有數量<input name="quantity" type="number" min="0" step="0.0001" required defaultValue={edited && 'quantity' in edited ? edited.quantity : ''} /></label></>}
        {ownershipInputs()}
      </div>{error && <div className="field-error" role="alert">{error}</div>}<div className="form-actions"><button type="button" className="button ghost" onClick={() => setEditor(null)}>取消</button><button type="submit" className="button primary">儲存{labels[editor.kind]}</button></div>
    </form>}
    {(['income', 'expense', 'liability', 'account', 'holding'] as Kind[]).map((kind) => <div className="finance-group" key={kind}><h3>{labels[kind]}</h3><div className="data-list">{listFor(kind).map((item) => <article key={item.id}><div><strong>{'name' in item ? item.name : `${data.accounts.find((account) => account.id === item.accountId)?.name}－${data.assets.find((asset) => asset.id === item.assetId)?.name}`}</strong><p>{item.status === 'provided' ? '已提供' : item.status === 'notProvided' ? '未提供' : '不適用'}</p></div><strong>{amount(item)}</strong><button className="icon-button" aria-label={`編輯${labels[kind]}`} onClick={() => open(kind, item)}><Pencil size={18} /></button><button className="icon-button danger" aria-label={`刪除${labels[kind]}`} onClick={() => remove(kind, item.id)}><Trash2 size={18} /></button></article>)}{listFor(kind).length === 0 && <div className="empty-state">尚未建立{labels[kind]}資料。</div>}</div></div>)}
  </section>
}
