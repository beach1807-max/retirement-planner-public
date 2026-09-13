import { useRef, useState, type FormEvent } from 'react'
import Decimal from 'decimal.js'
import { Building2, Landmark, Search, WalletCards } from 'lucide-react'
import type { PlannerData } from '../application/planner-data'
import { allocationLabels, buildQuickAsset, createQuickAssetDraft, quickAssetValue, type QuickAssetDraft, type QuickAssetType } from '../application/quick-add-asset'
import { lookupQuickAsset, type QuickLookupResult } from '../application/quick-asset-lookup'
import { createDefaultMarketDataProvider } from '../infrastructure/us-market-data-router'
import { MassiveInstrumentReferenceProvider } from '../infrastructure/massive-market-data-provider'
import { exchangeRateFor, formatMoney } from '../application/money'
import { resolveAssetReturnPresetKey } from '../domain/default-return-presets'
import type { SupportedMarket } from '../domain/market-trackable'

export interface QuickAddProps {
  data: PlannerData
  onCommit: (draft: QuickAssetDraft) => Promise<boolean>
  onCancel: () => void
  onComplete: (joined: boolean) => void
  lookup?: (market: SupportedMarket, symbol: string) => Promise<QuickLookupResult>
}
const defaultLookup = (market: SupportedMarket, symbol: string) => lookupQuickAsset(createDefaultMarketDataProvider(), new MassiveInstrumentReferenceProvider(), market, symbol)
const typeLabels: Record<QuickAssetType, string> = { stock: '股票', etf: 'ETF', bond: '債券', fund: '基金', cash: '現金／活存', timeDeposit: '定期存款', moneyMarketFund: '貨幣市場類', property: '不動產', insurance: '保單價值', other: '黃金／其他可估值資產' }
type Category = 'investment' | 'cash' | 'other'
const categoryTypes: Record<Category, QuickAssetType[]> = { investment: ['stock', 'etf', 'fund', 'bond', 'other'], cash: ['cash', 'timeDeposit', 'moneyMarketFund'], other: ['other', 'property', 'insurance'] }

export function QuickAddAsset({ data, onCommit, onCancel, onComplete, lookup = defaultLookup }: QuickAddProps) {
  const [draft, setDraft] = useState(() => createQuickAssetDraft(data))
  const [category, setCategory] = useState<Category | null>(null)
  const [step, setStep] = useState<'input' | 'review'>('input')
  const [error, setError] = useState('')
  const [lookupMessage, setLookupMessage] = useState('')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({})
  const [marketConfirmed, setMarketConfirmed] = useState(false)
  const request = useRef(0)
  const submitting = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const excluded = ['property', 'insurance'].includes(draft.assetType)
  const quantityAllowed = ['stock', 'etf'].includes(draft.assetType)
  const preset = data.assumptions.assetReturnPresets.find((p) => p.key === resolveAssetReturnPresetKey(draft.assetType, draft.allocationClass))!
  const fx = exchangeRateFor(data, 'USD')
  let value = ''
  try { value = quickAssetValue(draft) } catch { /* 等待必要金額填妥。 */ }

  function patch(update: Partial<QuickAssetDraft>) { setDraft((current) => ({ ...current, ...update })); setError('') }
  function fail(message: string) { setError(message); window.requestAnimationFrame(() => errorRef.current?.focus()) }
  function invalidate() { request.current++; setSearching(false); setLookupMessage(''); setMarketConfirmed(false) }
  function chooseType(type: QuickAssetType, group = category) {
    invalidate()
    const allocationClass = type === 'stock' ? 'stock' : type === 'bond' ? 'bond' : ['cash', 'timeDeposit'].includes(type) ? 'cash' : type === 'moneyMarketFund' ? 'moneyMarket' : ['etf', 'fund'].includes(type) ? '' : 'other'
    patch({ assetType: type, allocationClass, valueMode: ['stock', 'etf'].includes(type) ? 'quantity' : 'value', quote: undefined, price: '', trackMarket: false, joinPortfolio: group !== 'other', retirementUsageScope: ['property', 'insurance'].includes(type) ? 'excluded' : draft.ownershipType === 'individual' ? 'personal' : 'household', customRates: undefined, targetsConfirmed: false })
  }
  function chooseCategory(group: Category) { setCategory(group); chooseType(categoryTypes[group][0], group) }
  async function search() {
    const token = ++request.current
    setSearching(true); setLookupMessage(''); patch({ quote: undefined, trackMarket: false })
    try {
      const result = await lookup(draft.market, draft.symbol)
      if (token !== request.current) return
      if (result.market !== draft.market) setMarketConfirmed(false)
      setDraft((current) => ({ ...current, name: current.name || result.name || '', market: result.market, quote: result.quote, fetchedAt: result.fetchedAt, price: result.quote?.price ?? current.price, providerRate: result.rate, trackMarket: current.valueMode === 'quantity' && Boolean(result.quote) && (result.market === 'US' || (marketConfirmed && result.market === draft.market)) }))
      setLookupMessage([result.quote ? '已取得收盤價；請確認商品形式及主要投資類別。' : '', ...result.messages].filter(Boolean).join(' '))
    } catch (caught) {
      if (token === request.current) setLookupMessage(caught instanceof Error ? caught.message : '查詢暫不可用，請手動填寫。')
    } finally { if (token === request.current) setSearching(false) }
  }
  function review(event: FormEvent) {
    event.preventDefault()
    try {
      if (draft.trackMarket && draft.market !== 'US' && !marketConfirmed) throw new Error('請確認台股上市／上櫃市場，或關閉行情追蹤。')
      buildQuickAsset(data, draft)
      setError(''); setStep('review')
      window.requestAnimationFrame(() => heading.current?.focus())
    } catch (caught) { fail(caught instanceof Error ? friendlyError(caught.message) : '請檢查輸入。') }
  }
  async function save() {
    if (submitting.current) return
    submitting.current = true; setSaving(true); setError('')
    try {
      if (await onCommit(draft)) { request.current++; onComplete(draft.joinPortfolio) }
      else fail('尚未儲存成功，輸入已保留。請重試或先匯出既有資料備份。')
    } catch (caught) { fail(caught instanceof Error ? friendlyError(caught.message) : '儲存失敗，輸入已保留。') }
    finally { submitting.current = false; setSaving(false) }
  }
  function cancel() { request.current++; onCancel() }
  return <section className="quick-add editor-form" aria-label="快速新增資產 Beta">
    <div className="panel-heading"><div><p className="eyebrow">Beta · 測試中</p><h3 ref={heading} tabIndex={-1}>{step === 'review' ? '確認這筆資產' : '這是什麼資產？'}</h3><p className="muted">與現有新增入口並存，資料會存入同一份規劃。</p></div></div>
    {step === 'input' ? <form onSubmit={review}>
      <div className="quick-categories">{([
        ['investment', '投資商品', '股票、ETF、基金、債券', Landmark],
        ['cash', '現金／存款', '餘額、定存、貨幣市場', WalletCards],
        ['other', '其他資產', '不動產、保單、黃金等', Building2],
      ] as const).map(([key, label, hint, Icon]) => <button className={'quick-category' + (category === key ? ' selected' : '')} type="button" key={key} aria-pressed={category === key} onClick={() => chooseCategory(key)}><Icon size={22} aria-hidden="true" /><strong>{label}</strong><small>{hint}</small></button>)}</div>
      {category && <>
        <div className="form-grid three">
          <label>資產種類<select value={draft.assetType} onChange={(e) => chooseType(e.target.value as QuickAssetType)}>{categoryTypes[category].map((type) => <option key={type} value={type}>{category === 'investment' && type === 'other' ? '其他有價證券' : typeLabels[type]}</option>)}</select></label>
          <label>幣別<select value={draft.currency} onChange={(e) => { invalidate(); patch({ currency: e.target.value as 'TWD' | 'USD', quote: undefined, trackMarket: false, market: e.target.value === 'USD' ? 'US' : 'TWSE' }); setLookupMessage('金額不會自動換匯，請確認輸入金額的幣別；行情追蹤已關閉。') }}><option value="TWD">TWD 新台幣</option><option value="USD">USD 美元</option></select></label>
        </div>
        {category === 'investment' && quantityAllowed && <fieldset><legend>依代號查詢（可略過，直接手動填寫）</legend>
          <div className="form-grid three"><label>查詢市場<select value={draft.market} onChange={(e) => { invalidate(); patch({ market: e.target.value as SupportedMarket, currency: e.target.value === 'US' ? 'USD' : 'TWD', quote: undefined, trackMarket: false }); setLookupMessage('請確認金額幣別；變更市場不會換算已填金額。') }}><option value="TWSE">台灣上市</option><option value="TPEX">台灣上櫃</option><option value="US">美國</option></select></label>
          <label>商品代號<input value={draft.symbol} onChange={(e) => { invalidate(); patch({ symbol: e.target.value.toUpperCase(), quote: undefined, price: '', trackMarket: false }) }} placeholder={draft.market === 'US' ? '例如 VTI' : '例如 0050'} /></label>
          <button className="button secondary" type="button" onClick={search} disabled={searching || !draft.symbol.trim()}><Search size={18} />{searching ? '查詢中…' : '查詢商品'}</button></div>
          {draft.market !== 'US' && <label className="checkbox-row"><input type="checkbox" checked={marketConfirmed} onChange={(e) => { setMarketConfirmed(e.target.checked); patch({ trackMarket: e.target.checked && Boolean(draft.quote) }) }} />我已確認此商品的上市／上櫃市場</label>}
          <p className="muted">查價不代表已辨識商品類別。若不確定市場，可直接填寫估值並略過追蹤。</p>
        </fieldset>}
        {lookupMessage && <p className="alert info" role="status">{lookupMessage}</p>}
        <div className="form-grid three">
          <label>名稱<input required value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder={draft.assetType === 'property' ? '例如：我的房屋' : '例如：退休投資、生活備用金'} /></label>
          {quantityAllowed && <label>估值方式<select value={draft.valueMode} onChange={(e) => patch({ valueMode: e.target.value as 'value' | 'quantity', trackMarket: false })}><option value="quantity">持有數量 × 單價</option><option value="value">直接填寫目前市值</option></select></label>}
          {draft.valueMode === 'quantity' ? <>
            <label>持有數量（股／受益權單位）<input type="number" min="0" step="any" required value={draft.quantity} onChange={(e) => patch({ quantity: e.target.value })} /><small>台股請填股數，非張數。</small></label>
            <label>單價（{draft.currency}）<input type="number" min="0" step="any" required value={draft.price} onChange={(e) => { request.current++; setSearching(false); patch({ price: e.target.value }) }} /></label>
          </> : <label>{category === 'cash' ? '目前餘額' : '目前估計價值'}（{draft.currency}）<input type="number" min="0" step="any" required value={draft.amount} onChange={(e) => patch({ amount: e.target.value })} /></label>}
          {category === 'investment' && <label>主要投資類別<select required value={draft.allocationClass} onChange={(e) => patch({ allocationClass: e.target.value as QuickAssetDraft['allocationClass'] })}><option value="">請確認類別</option>{Object.entries(allocationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small>ETF 是商品形式；股票型與債券型請分別選擇。</small></label>}
          <label>存放帳戶（選填）<select value={draft.accountId} onChange={(e) => patch({ accountId: e.target.value })}><option value="">未分類</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="new">＋新增帳戶</option></select></label>
          {draft.accountId === 'new' && <label>新帳戶名稱<input required value={draft.newAccountName} onChange={(e) => patch({ newAccountName: e.target.value })} /></label>}
        </div>
        {draft.quote && <p className="muted">查得收盤價：{draft.quote.price} {draft.quote.currency} · {draft.quote.asOf} · {draft.quote.sourceId}</p>}
        {quantityAllowed && draft.valueMode === 'quantity' && <><label className="checkbox-row"><input type="checkbox" checked={draft.trackMarket} disabled={!draft.quote || (draft.market !== 'US' && !marketConfirmed)} onChange={(e) => patch({ trackMarket: e.target.checked })} />日後可在行情頁更新此商品估值</label><p className="muted">手動單價僅用於本次估值；數量會保存。未啟用追蹤時不保存商品代號或供應商報價。</p></>}
        {draft.currency === 'USD' && <fieldset><legend>美元換算</legend><p className="muted">{fx ? '沿用匯率 ' + fx.rate + '（' + fx.sourceId + ' · ' + fx.asOf + '）' : draft.providerRate ? '查得匯率 ' + draft.providerRate.rate + '（' + draft.providerRate.sourceId + ' · ' + draft.providerRate.asOf + '）' : '尚無有效匯率，請輸入。'}。原始金額保存為美元，預測期間使用固定匯率。</p><label>手動美元匯率（1 USD 換多少 TWD）<input type="number" min="0.000001" step="any" required={!fx && !draft.providerRate} value={draft.exchangeRate} onChange={(e) => patch({ exchangeRate: e.target.value })} placeholder={fx?.rate ?? draft.providerRate?.rate} /><small>留空沿用有效匯率；明確填寫新匯率會影響全部美元資產。</small></label></fieldset>}
        <div className="quick-value" aria-live="polite">目前市值：{value ? formatMoney({ amount: value, currency: draft.currency }) : '等待金額'}{value === '0.00' && <small>目前為 0 元，尚無有效配置占比。</small>}</div>
        <fieldset><legend>是否加入預測？</legend><label className="checkbox-row"><input type="checkbox" checked={draft.joinPortfolio} disabled={excluded} onChange={(e) => patch({ joinPortfolio: e.target.checked })} />加入投資組合與長期預測</label><p className="muted">{excluded ? '不動產與保單本次只保存估值，不加入投資組合與長期預測。' : '公版目前以同一份資產清單計算組合及長期預測；未選取仍可納入總資產。'}</p>
        {draft.joinPortfolio && !data.portfolios.length && <div className="quick-first-portfolio"><h4>首次建立投資組合</h4><p>請設定目標比例（合計 100%），或取消上方勾選，先保存資產、稍後設定。以下只納入本次新增資產。</p>
          <div className="form-grid three">{Object.entries(allocationLabels).map(([key, label]) => <label key={key}>{label}目標（%）<input type="number" min="0" max="100" step="any" value={draft.targets[key as keyof typeof allocationLabels]} onChange={(e) => patch({ targets: { ...draft.targets, [key]: e.target.value }, targetsConfirmed: false })} /></label>)}</div>
          <label className="checkbox-row"><input type="checkbox" checked={draft.targetsConfirmed} onChange={(e) => patch({ targetsConfirmed: e.target.checked })} />我已確認上述目標比例</label>
        </div>}</fieldset>
        <details className="advanced-settings"><summary>進階設定（選填）</summary><div className="form-grid three">
          <label>所有權<select value={draft.ownershipType} onChange={(e) => patch({ ownershipType: e.target.value as QuickAssetDraft['ownershipType'], retirementUsageScope: excluded ? 'excluded' : e.target.value === 'individual' ? 'personal' : 'household' })}><option value="individual">個人持有</option><option value="household">家庭共同使用</option><option value="joint">共同持分</option></select></label>
          {draft.ownershipType === 'individual' && <label>持有人<select value={draft.ownerMemberId} onChange={(e) => patch({ ownerMemberId: e.target.value })}>{data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
          {draft.ownershipType === 'joint' && data.members.map((m) => <label key={m.id}>{m.name}持分（%）<input type="number" min="0" max="100" step="any" value={draft.shares[m.id] ?? ''} onChange={(e) => patch({ shares: { ...draft.shares, [m.id]: e.target.value } })} /></label>)}
          <label>可動用日期<input type="date" required value={draft.availableFrom} onChange={(e) => patch({ availableFrom: e.target.value })} /></label>
          <label>既有退休試算使用範圍<select value={draft.retirementUsageScope} onChange={(e) => patch({ retirementUsageScope: e.target.value as QuickAssetDraft['retirementUsageScope'] })}><option value="personal">個人退休使用</option><option value="household">家庭退休可用</option><option value="excluded">不納入既有退休試算</option></select><small>此設定不取代上方的組合／長期預測選取。</small></label>
          <label>投資地區<select value={draft.region} onChange={(e) => patch({ region: e.target.value as QuickAssetDraft['region'] })}><option value="">未指定</option><option value="taiwan">台灣</option><option value="us">美國</option><option value="global">全球</option><option value="other">其他</option></select><small>掛牌市場不等於投資地區。</small></label>
          <label>風險分類<select value={draft.riskLevel} onChange={(e) => patch({ riskLevel: e.target.value as QuickAssetDraft['riskLevel'] })}><option value="">未指定</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
          <label>既有退休試算報酬設定<select value={draft.returnProfileId} onChange={(e) => patch({ returnProfileId: e.target.value })}><option value="">未設定（0%）</option>{data.assumptions.returnProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="checkbox-row"><input type="checkbox" checked={draft.includeInTotalAssets} onChange={(e) => patch({ includeInTotalAssets: e.target.checked })} />納入總資產</label>
        </div><fieldset><legend>長期預測三情境報酬</legend><p className="muted">沿用目前系統的{preset.label}預設；與既有退休試算報酬設定分開。</p><label className="checkbox-row"><input type="checkbox" checked={Boolean(draft.customRates)} onChange={(e) => { setRateInputs({}); patch({ customRates: e.target.checked ? { ...preset.scenarioRates } : undefined }) }} />自訂此筆三情境報酬</label>
          <div className="form-grid three">{([['conservative', '保守'], ['balanced', '穩健'], ['optimistic', '樂觀']] as const).map(([key, label]) => <label key={key}>{label}年報酬（%）<input type="text" inputMode="decimal" disabled={!draft.customRates} value={draft.customRates && rateInputs[key] !== undefined ? rateInputs[key] : new Decimal((draft.customRates ?? preset.scenarioRates)[key] || '0').mul(100).toString()} onChange={(e) => { const raw = e.target.value; setRateInputs((current) => ({ ...current, [key]: raw })); patch({ customRates: { ...draft.customRates!, [key]: raw.trim() && Number.isFinite(Number(raw)) ? new Decimal(raw).div(100).toString() : '' } }) }} /></label>)}</div>
        </fieldset></details>
      </>}
      {error && <div className="field-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
      <div className="form-actions"><button className="button ghost" type="button" onClick={cancel}>取消快速新增</button>{category && <button className="button primary" type="submit" disabled={searching}>檢查並繼續</button>}</div>
    </form> : <>
      <dl className="quick-summary"><dt>資產</dt><dd>{draft.name} · {typeLabels[draft.assetType]} · {draft.allocationClass && allocationLabels[draft.allocationClass]}</dd><dt>目前市值</dt><dd>{formatMoney({ amount: value, currency: draft.currency })}</dd><dt>持有方式</dt><dd>{draft.ownershipType === 'individual' ? data.members.find((m) => m.id === draft.ownerMemberId)?.name : draft.ownershipType === 'joint' ? '共同持分' : '家庭共同使用'}</dd><dt>納入總資產</dt><dd>{draft.includeInTotalAssets ? '是' : '否'}</dd><dt>投資組合與長期預測</dt><dd>{draft.joinPortfolio ? '加入' : '不加入，可稍後設定'}</dd><dt>行情更新</dt><dd>{draft.trackMarket ? draft.market + ' · ' + draft.symbol : '手動估值'}</dd><dt>三情境年報酬</dt><dd>{Object.values(draft.customRates ?? preset.scenarioRates).map((r) => new Decimal(r).mul(100).toString() + '%').join(' ／ ')}</dd></dl>
      {draft.currency === 'USD' && <p className="muted">USD/TWD：{draft.exchangeRate || fx?.rate || draft.providerRate?.rate}。{draft.exchangeRate && '手動匯率將套用所有美元資產。'}</p>}
      {!draft.trackMarket && draft.symbol && <p className="muted">手動模式不保存商品代號；{draft.valueMode === 'quantity' ? '數量與估值會保存，單價只用於本次計算。' : '本次保存目前估值。'}</p>}
      {!data.portfolios.length && draft.joinPortfolio && <p>新組合目標：{Object.entries(draft.targets).filter(([, v]) => Number(v) > 0).map(([k, v]) => allocationLabels[k as keyof typeof allocationLabels] + ' ' + v + '%').join('、')}</p>}
      {error && <div className="field-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
      <div className="form-actions"><button className="button ghost" disabled={saving} onClick={cancel}>取消快速新增</button><button className="button secondary" disabled={saving} onClick={() => setStep('input')}>返回修改</button><button className="button primary" disabled={saving} onClick={save}>{saving ? '儲存中…' : '完成新增'}</button></div>
    </>}
  </section>
}

function friendlyError(message: string): string {
  if (message.includes('OWNER') || message.includes('SHARE')) return '請確認持有人；共同持分需至少兩位成員且合計 100%。'
  if (message.includes('SCENARIO_RATES') || message.includes('DecimalError')) return '三情境報酬須介於 -99% 至 100%，且保守 ≤ 穩健 ≤ 樂觀。'
  return message.startsWith('INVALID_') ? '資料欄位或關聯無效，請確認進階設定。' : message
}
