import Decimal from 'decimal.js'
import { useState, type FormEvent } from 'react'
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import type { OwnershipFields, PlannerAccount, PlannerData, PlannerExpense, PlannerHolding, PlannerIncome, PlannerLiability } from '../application/planner-data'
import { projectLiability } from '../domain/liability-engine'
import { CurrencyInput } from './CurrencyInput'

interface Props { data: PlannerData; onChange: (data: PlannerData) => void | Promise<void> }
type Kind = 'account' | 'holding' | 'income' | 'expense' | 'liability'
type Item = PlannerAccount | PlannerHolding | PlannerIncome | PlannerExpense | PlannerLiability
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const labels: Record<Kind, string> = { account: '帳戶', holding: '持有部位', income: '收入', expense: '平均支出', liability: '負債' }

export function FinancialDataSections({ data, onChange }: Props) {
  const [editor, setEditor] = useState<{ kind: Kind; id: string | 'new' } | null>(null)
  const [ownershipType, setOwnershipType] = useState<OwnershipFields['ownershipType']>('individual')
  const [liabilityType, setLiabilityType] = useState<PlannerLiability['liabilityType']>('mortgage')
  const [repaymentType, setRepaymentType] = useState<NonNullable<PlannerLiability['repaymentType']>>('levelPayment')
  const [capabilities, setCapabilities] = useState<NonNullable<PlannerLiability['selectedCapabilities']>>(['annualInterestRate', 'remainingTermMonths', 'monthlyPayment'])
  const [error, setError] = useState<string | null>(null)
  const listFor = (kind: Kind): Item[] => kind === 'account' ? data.accounts : kind === 'holding' ? data.holdings : kind === 'income' ? data.incomes : kind === 'expense' ? data.expenses : data.liabilities
  const edited = editor?.id && editor.id !== 'new' ? listFor(editor.kind).find((item) => item.id === editor.id) : undefined

  function open(kind: Kind, item?: Item) {
    setEditor({ kind, id: item?.id ?? 'new' })
    setOwnershipType(item && 'ownershipType' in item ? item.ownershipType : kind === 'expense' || kind === 'liability' ? 'household' : 'individual')
    if (kind === 'liability') {
      const liability = item as PlannerLiability | undefined
      setLiabilityType(liability?.liabilityType ?? 'mortgage')
      setRepaymentType(liability?.repaymentType ?? 'levelPayment')
      setCapabilities(liability?.selectedCapabilities ?? ['annualInterestRate', 'remainingTermMonths', 'monthlyPayment'])
    }
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
        const originalPrincipal = String(form.get('originalPrincipal') ?? '')
        const annualInterestRate = String(form.get('annualInterestRate') ?? '')
        const term = String(form.get('remainingTermMonths') ?? '')
        const grace = String(form.get('gracePeriodMonths') ?? '')
        const payment = String(form.get('monthlyPayment') ?? '')
        const item: PlannerLiability = { ...common, liabilityType, currentBalance: { amount: String(form.get('amount')), currency: 'TWD' }, monthlyPayment: { amount: payment || '0', currency: 'TWD' }, originalPrincipal: originalPrincipal ? { amount: originalPrincipal, currency: 'TWD' } : undefined, balanceAsOfMonth: String(form.get('balanceAsOfMonth')), annualInterestRate: repaymentType === 'manual' ? undefined : new Decimal(annualInterestRate || 0).div(100).toString(), repaymentType, remainingTermMonths: repaymentType !== 'manual' && term ? Number(term) : undefined, gracePeriodMonths: grace ? Number(grace) : undefined, includeInTotalLiabilities: form.get('includeInTotalLiabilities') === 'on', selectedCapabilities: liabilityType === 'other' ? capabilities : undefined, notes: String(form.get('notes') ?? '') || undefined }
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

  function liabilityDetail(item: PlannerLiability) {
    const result = projectLiability({ id: item.id, name: item.name, balanceAsOfMonth: item.balanceAsOfMonth ?? data.calculationBaseDate.slice(0, 7), currentBalance: item.currentBalance.amount, annualInterestRate: item.annualInterestRate, repaymentType: item.repaymentType, remainingTermMonths: item.remainingTermMonths, fixedMonthlyPayment: item.monthlyPayment.amount, gracePeriodMonths: item.gracePeriodMonths, rateChanges: item.rateChanges, extraPayments: item.extraPayments?.map((event) => ({ month: event.month, amount: event.amount.amount })) })
    if (item.status !== 'provided') return item.status === 'notProvided' ? '尚未設定' : '不適用'
    if (result.status === 'manual') return '手動管理；補上還款條件後可推估清償日期'
    if (result.status === 'unpayable') return '依目前條件無法在期數內清償'
    return `預計 ${result.payoffMonth} 清償 · 剩餘利息約 ${currency.format(Number(result.totalInterest))}`
  }

  const editedIncome = editor?.kind === 'income' ? edited as PlannerIncome | undefined : undefined
  const editedLiability = editor?.kind === 'liability' ? edited as PlannerLiability | undefined : undefined
  const needsPayment = repaymentType === 'fixedPayment' || repaymentType === 'manual'
  const supportsGrace = liabilityType === 'mortgage' || liabilityType === 'studentLoan' || (liabilityType === 'other' && capabilities.includes('gracePeriod'))
  const toggleCapability = (capability: NonNullable<PlannerLiability['selectedCapabilities']>[number], checked: boolean) => setCapabilities((current) => checked ? [...new Set([...current, capability])] : current.filter((item) => item !== capability))

  return <section className="panel">
    <div className="panel-heading"><div><h2><Landmark size={21} /> 收支、負債與帳戶</h2><p>收入不會自動視為可投入金額；這裡保存家庭財務基礎與資料完整度。</p></div></div>
    <div className="action-row">{(['income', 'expense', 'liability', 'account', 'holding'] as Kind[]).map((kind) => <button key={kind} className="button secondary small" disabled={kind === 'holding' && (data.accounts.length === 0 || data.assets.length === 0)} onClick={() => open(kind)}><Plus size={16} /> {labels[kind]}</button>)}</div>
    {editor && <form key={`${editor.kind}-${editor.id}`} className="editor-form" onSubmit={save}>
      <h3>{editor.id === 'new' ? '新增' : '編輯'}{labels[editor.kind]}</h3><div className="form-grid three">
        {editor.kind !== 'holding' && <label>名稱<input name="name" required defaultValue={edited && 'name' in edited ? edited.name : ''} /></label>}
        <label>設定狀態<select name="status" defaultValue={edited?.status ?? 'provided'}><option value="provided">已設定</option><option value="notProvided">尚未設定</option><option value="notApplicable">不適用</option></select><small>只表示這筆資料是否已完成設定；是否納入計算仍依各項範圍設定判斷。</small></label>
        {editor.kind === 'account' && <><label>機構<input name="institution" defaultValue={edited && 'institution' in edited ? edited.institution : ''} /></label><label>帳戶類型<select name="accountType" defaultValue={edited && 'accountType' in edited ? edited.accountType : 'bank'}><option value="cash">現金</option><option value="bank">銀行</option><option value="brokerage">證券</option><option value="insurance">保險</option><option value="property">不動產</option><option value="retirement">退休帳戶</option><option value="other">其他</option></select></label></>}
        {editor.kind === 'income' && <><label>收入類型<select name="incomeType" defaultValue={editedIncome?.incomeType ?? 'salary'}><option value="salary">薪資</option><option value="otherFixed">其他固定收入</option></select></label><label>每月金額（TWD）<CurrencyInput name="amount" required defaultValue={editedIncome?.monthlyAmount.amount ?? ''} /></label><label>年成長率（%）<input name="growthPercent" type="number" step="0.1" defaultValue={editedIncome ? Number(editedIncome.annualGrowthRate) * 100 : 0} /></label></>}
        {editor.kind === 'expense' && <label>每月平均金額（TWD）<CurrencyInput name="amount" required defaultValue={edited && 'monthlyAmount' in edited ? edited.monthlyAmount.amount : ''} /></label>}
        {editor.kind === 'liability' && <><label>負債類型<select name="liabilityType" value={liabilityType} onChange={(event) => setLiabilityType(event.target.value as PlannerLiability['liabilityType'])}><option value="mortgage">房屋貸款</option><option value="personalLoan">信用貸款</option><option value="carLoan">車輛貸款</option><option value="studentLoan">學貸</option><option value="creditCardInstallment">信用卡／分期</option><option value="other">其他貸款／其他負債</option></select></label><label>目前剩餘本金（TWD）<CurrencyInput name="amount" required defaultValue={editedLiability?.currentBalance.amount ?? ''} /></label><label>餘額基準月份<input name="balanceAsOfMonth" type="month" required defaultValue={editedLiability?.balanceAsOfMonth ?? data.calculationBaseDate.slice(0, 7)} /></label><label>還款方式<select name="repaymentType" value={repaymentType} onChange={(event) => setRepaymentType(event.target.value as NonNullable<PlannerLiability['repaymentType']>)}><option value="levelPayment">本息平均攤還</option><option value="equalPrincipal">本金平均攤還</option><option value="fixedPayment">固定金額付款</option><option value="interestOnly">只繳利息，期末清償本金</option><option value="balloon">本金到期清償（期間繳息）</option><option value="manual">不固定還款／手動管理</option></select></label>
          {liabilityType === 'other' && <fieldset className="form-span"><legend>選擇這筆負債需要的資料</legend><div className="checkbox-grid">{([['originalPrincipal', '原始借款金額'], ['annualInterestRate', '年利率'], ['remainingTermMonths', '剩餘期數'], ['monthlyPayment', '固定月付款'], ['gracePeriod', '寬限期']] as const).map(([value, label]) => <label className="checkbox-row" key={value}><input type="checkbox" checked={capabilities.includes(value)} onChange={(event) => toggleCapability(value, event.target.checked)} />{label}</label>)}</div><small>還款方式所必需的利率、期數或月付款會自動顯示。</small></fieldset>}
          {(liabilityType !== 'other' || capabilities.includes('originalPrincipal')) && <label>原始借款金額（選填）<CurrencyInput name="originalPrincipal" defaultValue={editedLiability?.originalPrincipal?.amount} /></label>}
          {repaymentType !== 'manual' && <label>年利率（%）<input name="annualInterestRate" type="number" min="0" step="0.001" required defaultValue={editedLiability?.annualInterestRate !== undefined ? Number(editedLiability.annualInterestRate) * 100 : 0} /></label>}
          {repaymentType !== 'manual' && <label>剩餘期數（月）<input name="remainingTermMonths" type="number" min="1" step="1" required defaultValue={editedLiability?.remainingTermMonths ?? ''} /></label>}
          {needsPayment && <label>{repaymentType === 'manual' ? '目前每月還款（TWD）' : '固定月付款（TWD）'}<CurrencyInput name="monthlyPayment" required defaultValue={editedLiability?.monthlyPayment.amount ?? ''} /></label>}
          {supportsGrace && repaymentType !== 'manual' && <label>剩餘寬限期（月）<input name="gracePeriodMonths" type="number" min="0" step="1" defaultValue={editedLiability?.gracePeriodMonths ?? 0} /></label>}
          <label className="checkbox-row"><input name="includeInTotalLiabilities" type="checkbox" defaultChecked={editedLiability?.includeInTotalLiabilities ?? true} />納入總負債與投資比較</label><label className="form-span">備註<textarea name="notes" defaultValue={editedLiability?.notes} /></label><p className="muted form-span">不需要填寫收入或逐月現金流；系統會依這些條件推算每月本金、利息、剩餘負債與清償時間。</p></>}
        {editor.kind === 'holding' && <><label>帳戶<select name="accountId" defaultValue={edited && 'accountId' in edited ? edited.accountId : ''}>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>資產<select name="assetId" defaultValue={edited && 'assetId' in edited ? edited.assetId : ''}>{data.assets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>持有數量<input name="quantity" type="number" min="0" step="0.0001" required defaultValue={edited && 'quantity' in edited ? edited.quantity : ''} /></label></>}
        {ownershipInputs()}
      </div>{error && <div className="field-error" role="alert">{error}</div>}<div className="form-actions"><button type="button" className="button ghost" onClick={() => setEditor(null)}>取消</button><button type="submit" className="button primary">儲存{labels[editor.kind]}</button></div>
    </form>}
    {(['income', 'expense', 'liability', 'account', 'holding'] as Kind[]).map((kind) => <div className="finance-group" key={kind}><h3>{labels[kind]}</h3><div className="data-list">{listFor(kind).map((item) => <article key={item.id}><div><strong>{'name' in item ? item.name : `${data.accounts.find((account) => account.id === item.accountId)?.name}－${data.assets.find((asset) => asset.id === item.assetId)?.name}`}</strong><p>{'currentBalance' in item ? liabilityDetail(item) : item.status === 'provided' ? '已設定' : item.status === 'notProvided' ? '尚未設定' : '不適用'}</p></div><strong>{amount(item)}</strong><button className="icon-button" aria-label={`編輯${labels[kind]}`} onClick={() => open(kind, item)}><Pencil size={18} /></button><button className="icon-button danger" aria-label={`刪除${labels[kind]}`} onClick={() => remove(kind, item.id)}><Trash2 size={18} /></button></article>)}{listFor(kind).length === 0 && <div className="empty-state">尚未建立{labels[kind]}資料。</div>}</div></div>)}
  </section>
}
