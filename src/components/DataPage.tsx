import Decimal from 'decimal.js'
import { exchangeRateFor, formatMoney, moneyToTwd } from '../application/money'
import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, WalletCards } from 'lucide-react'
import type { PlannerAsset, PlannerContribution, PlannerData } from '../application/planner-data'
import { resolveAssetReturnPresetKey } from '../domain/default-return-presets'
import { FinancialDataSections } from './FinancialDataSections'
import type { DashboardViewModel } from '../application/planner-service'
import { CalculationHelp } from './CalculationHelp'
import { MemberManagement } from './MemberManagement'
import { defaultAllocationClassForAssetType } from '../domain/asset-classification'
import { inferTwseSymbolFromAssetName, isMarketTrackableAssetType } from '../domain/market-trackable'
import { upsertAssetMarketLink } from '../application/asset-market-link'

interface Props { summary: DashboardViewModel; data: PlannerData; onChange: (data: PlannerData) => void | Promise<void> }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const statusLabels = { provided: '已設定', notProvided: '尚未設定', notApplicable: '不適用' }

export function DataPage({ data, onChange, summary }: Props) {
  const [assetEditor, setAssetEditor] = useState<string | 'new' | null>(data.assets.length === 0 ? 'new' : null)
  const [contributionEditor, setContributionEditor] = useState<string | 'new' | null>(null)
  const [ownershipType, setOwnershipType] = useState<PlannerAsset['ownershipType']>('individual')
  const [endRule, setEndRule] = useState<PlannerContribution['endRule']>('ownerRetirement')
  const [destinationKind, setDestinationKind] = useState<'asset' | 'profile'>('asset')
  const [assetRateMode, setAssetRateMode] = useState<'system' | 'custom'>('system')
  const [predictionSettingsOpen, setPredictionSettingsOpen] = useState(false)
  const [applySystemPreset, setApplySystemPreset] = useState(true)
  const [assetType, setAssetType] = useState<PlannerAsset['assetType']>('cash')
  const [allocationClass, setAllocationClass] = useState<NonNullable<PlannerAsset['allocationClass']>>('cash')
  const [allocationMode, setAllocationMode] = useState<'auto' | 'manual'>('auto')
  const [marketTracking, setMarketTracking] = useState(false)
  const [symbol, setSymbol] = useState('')
  const [assetCurrency, setAssetCurrency] = useState('TWD')
  const [endDateMode, setEndDateMode] = useState<'date' | 'month'>('date')
  const [customRates, setCustomRates] = useState({ conservative: '0', balanced: '0', optimistic: '0' })
  const [error, setError] = useState<string | null>(null)
  const editedAsset = assetEditor && assetEditor !== 'new' ? data.assets.find((item) => item.id === assetEditor) : undefined
  const editedContribution = contributionEditor && contributionEditor !== 'new' ? data.contributions.find((item) => item.id === contributionEditor) : undefined

  function editAsset(asset?: PlannerAsset) {
    setAssetEditor(asset?.id ?? 'new')
    setAssetCurrency(asset?.currentValue.currency ?? 'TWD')
    setAssetRateMode(asset?.scenarioRateOrigin?.type === 'systemPreset' || !asset?.scenarioRates ? 'system' : 'custom')
    setPredictionSettingsOpen(Boolean(asset))
    setApplySystemPreset(!asset || Boolean(asset?.scenarioRateOrigin))
    setAssetType(asset?.assetType ?? 'cash')
    setAllocationClass(asset?.allocationClass ?? defaultAllocationClassForAssetType(asset?.assetType ?? 'cash'))
    setAllocationMode(asset ? 'manual' : 'auto')
    const instrument = asset && data.instruments.find((item) => item.assetId === asset.id)
    setMarketTracking(Boolean(instrument))
    setSymbol(instrument?.symbol ?? inferTwseSymbolFromAssetName(asset?.name ?? '') ?? '')
    setCustomRates({
      conservative: asset?.scenarioRates ? new Decimal(asset.scenarioRates.conservative).mul(100).toString() : '0',
      balanced: asset?.scenarioRates ? new Decimal(asset.scenarioRates.balanced).mul(100).toString() : '0',
      optimistic: asset?.scenarioRates ? new Decimal(asset.scenarioRates.optimistic).mul(100).toString() : '0',
    })
    setOwnershipType(asset?.ownershipType ?? 'individual')
    setError(null)
  }

  function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const now = new Date().toISOString()
    let owners: PlannerAsset['owners']
    if (ownershipType === 'joint') {
      owners = data.members.flatMap((member) => {
        const percent = String(form.get(`share-${member.id}`) ?? '')
        return percent && Number(percent) > 0 ? [{ memberId: member.id, share: new Decimal(percent).div(100).toString() }] : []
      })
      const total = owners.reduce((sum, owner) => sum.plus(owner.share), new Decimal(0))
      if (owners.length < 2 || !total.eq(1)) { setError('共同持分至少需要兩位成員，且合計必須等於 100%。'); return }
    }
    const presetKey = resolveAssetReturnPresetKey(assetType, allocationClass)
    const preset = data.assumptions.assetReturnPresets.find((item) => item.key === presetKey)!
    const preserveLegacyRate = Boolean(editedAsset && !editedAsset.scenarioRates && !editedAsset.scenarioRateOrigin && assetRateMode === 'system' && !applySystemPreset)
    const scenarioRates = preserveLegacyRate ? undefined : assetRateMode === 'system'
      ? { conservative: preset.scenarioRates.conservative, balanced: preset.scenarioRates.balanced, optimistic: preset.scenarioRates.optimistic }
      : { conservative: new Decimal(customRates.conservative).div(100).toString(), balanced: new Decimal(customRates.balanced).div(100).toString(), optimistic: new Decimal(customRates.optimistic).div(100).toString() }
    if (scenarioRates && (new Decimal(scenarioRates.conservative).gt(scenarioRates.balanced) || new Decimal(scenarioRates.balanced).gt(scenarioRates.optimistic))) { setError('請讓保守報酬率 ≤ 穩健 ≤ 比較樂觀。'); return }
    const currentValue = String(form.get('currentValue')).trim() || editedAsset?.currentValue.amount || '0'
    const asset: PlannerAsset = {
      scenarioRates, scenarioRateOrigin: preserveLegacyRate ? undefined : assetRateMode === 'system' ? { type: 'systemPreset', presetKey } : { type: 'custom' },
      id: editedAsset?.id ?? crypto.randomUUID(), householdId: data.household.id, name: String(form.get('name')),
      assetType, ownershipType,
      allocationClass: allocationClass || undefined,
      ownerMemberId: ownershipType === 'individual' ? String(form.get('ownerMemberId')) : undefined, owners,
      currentValue: { amount: currentValue, currency: assetCurrency }, includeInTotalAssets: form.get('includeInTotalAssets') === 'on',
      retirementUsageScope: String(form.get('retirementUsageScope')) as PlannerAsset['retirementUsageScope'], availableFrom: String(form.get('availableFrom')),
      returnProfileId: String(form.get('returnProfileId')) || undefined, status: String(form.get('status')) as PlannerAsset['status'],
      accountId: String(form.get('accountId')) || undefined, region: String(form.get('region')) as PlannerAsset['region'] || undefined,
      riskLevel: String(form.get('riskLevel')) as PlannerAsset['riskLevel'] || undefined, propertyAddress: String(form.get('propertyAddress')) || undefined,
      createdAt: editedAsset?.createdAt ?? now, updatedAt: now,
    }
    const exchangeRates = [...data.exchangeRates]
    if (assetCurrency !== 'TWD') {
      const rate = String(form.get('exchangeRate') ?? '').trim()
      if (!rate || !new Decimal(rate).isFinite() || new Decimal(rate).lte(0)) { setError('請輸入大於 0 的原幣對台幣匯率。'); return }
      const existing = exchangeRateFor(data, assetCurrency)
      if (!existing || !new Decimal(existing.rate).eq(rate)) {
        const date = new Date().toISOString().slice(0, 10)
        exchangeRates.splice(0, exchangeRates.length, ...exchangeRates.filter((item) => item.fromCurrency !== assetCurrency), { id: 'fx-' + assetCurrency + '-TWD', householdId: data.household.id, fromCurrency: assetCurrency, toCurrency: 'TWD', rate, asOf: date, sourceId: 'manual', fetchedAt: now, createdAt: existing?.createdAt ?? now, updatedAt: now })
      }
    }
    const withAsset = { ...data, exchangeRates, assets: editedAsset ? data.assets.map((item) => item.id === asset.id ? asset : item) : [...data.assets, asset] }
    let next: PlannerData
    try {
      next = upsertAssetMarketLink(withAsset, {
        assetId: asset.id,
        enabled: marketTracking && assetCurrency === 'TWD' && isMarketTrackableAssetType(assetType),
        symbol,
        quantity: String(form.get('quantity') ?? ''),
        accountId: String(form.get('accountId') ?? '') || undefined,
      })
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'MISSING_HOLDING_QUANTITY' ? '請輸入持有數量。' : '請輸入有效的臺灣上市代碼。')
      return
    }
    void onChange(next)
    setAssetEditor(null); setError(null)
  }

  function editContribution(contribution?: PlannerContribution) {
    setContributionEditor(contribution?.id ?? 'new')
    setEndDateMode(contribution?.endDate?.length === 7 ? 'month' : 'date')
    setEndRule(contribution?.endRule ?? 'ownerRetirement')
    setDestinationKind(contribution?.returnProfileId ? 'profile' : 'asset')
    setError(null)
  }

  function saveContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const startDate = String(form.get('startDate'))
    const endDate = endRule === 'fixedDate' ? String(form.get('endDate')) : undefined
    if (endRule === 'fixedDate' && (!endDate || endDate < (endDateMode === 'date' ? startDate : startDate.slice(0, 7)))) { setError('結束時間不可早於投入開始時間。'); return }
    const now = new Date().toISOString()
    const contribution: PlannerContribution = {
      name: String(form.get('contributionName') ?? '').trim() || undefined,
      id: editedContribution?.id ?? crypto.randomUUID(), householdId: data.household.id, sourceMemberId: String(form.get('sourceMemberId')),
      amount: { amount: String(form.get('amount')), currency: 'TWD' }, usageScope: String(form.get('usageScope')) as PlannerContribution['usageScope'], startDate, endRule, endDate,
      destinationAssetId: destinationKind === 'asset' ? String(form.get('destinationAssetId')) : undefined,
      returnProfileId: destinationKind === 'profile' ? String(form.get('returnProfileId')) : undefined,
      status: String(form.get('status')) as PlannerContribution['status'], createdAt: editedContribution?.createdAt ?? now, updatedAt: now,
    }
    void onChange({ ...data, contributions: editedContribution ? data.contributions.map((item) => item.id === contribution.id ? contribution : item) : [...data.contributions, contribution] })
    setContributionEditor(null); setError(null)
  }

  return <div className="page-stack"><section className="panel"><h2>家庭完整資產摘要</h2><p className="muted">這是完整財產紀錄，與投資組合的預測範圍不同；共同資產只計一次。</p><div className="cashflow-grid"><article><CalculationHelp label="完整資產總額" topic="totalAssets" /><strong>{currency.format(Number(summary.totalAssetsTwd))}</strong></article><article><CalculationHelp label="總負債" topic="totalLiabilities" /><strong>{currency.format(Number(summary.totalLiabilitiesTwd))}</strong></article><article><CalculationHelp label="淨資產" topic="netWorth" /><strong>{currency.format(Number(summary.netWorthTwd))}</strong></article></div></section>
    {data.assets.some((asset) => asset.status === 'provided' && !moneyToTwd(data, asset.currentValue)) && <p role="alert">部分資產缺少匯率，尚未納入上方台幣合計，請編輯資產填寫匯率或至行情更新。</p>}
    <MemberManagement data={data} onChange={onChange} />

    <section className="panel">
      <div className="panel-heading"><div><h2><WalletCards size={21} /> 我的資產</h2><p>把目前擁有的資產記錄在這裡。記錄後，到「投資組合」選擇哪些資產要加入預測；所有金額以新臺幣填寫。</p></div><button className="button secondary" onClick={() => editAsset()}><Plus size={18} /> 新增資產</button></div>
      {assetEditor && <form key={assetEditor} className="editor-form" onSubmit={saveAsset}>
        <h3>基本資料</h3><p className="muted">這是什麼、現在值多少、是誰的。</p><div className="form-grid three">
          <label>資產名稱<input name="name" required defaultValue={editedAsset?.name} onChange={(event) => { if (!symbol) setSymbol(inferTwseSymbolFromAssetName(event.target.value) ?? '') }} /></label>
          <label>類型<select name="assetType" value={assetType} onChange={(event) => { const nextType = event.target.value as PlannerAsset['assetType']; setAssetType(nextType); if (allocationMode === 'auto') setAllocationClass(defaultAllocationClassForAssetType(nextType)); if (isMarketTrackableAssetType(nextType)) { setMarketTracking(true); setPredictionSettingsOpen(true) } else setMarketTracking(false) }}><option value="cash">現金</option><option value="timeDeposit">定存</option><option value="stock">股票</option><option value="etf">ETF</option><option value="bond">債券</option><option value="fund">基金</option><option value="moneyMarketFund">貨幣市場基金</option><option value="insurance">保險</option><option value="property">不動產</option><option value="retirementAccount">退休帳戶</option><option value="other">其他</option></select></label>
          <label>目前價值（{assetCurrency}）<input name="currentValue" type="number" required={!marketTracking} min="0" step="0.01" defaultValue={editedAsset?.currentValue.amount} /><small>{marketTracking ? '選填；尚未取得行情時使用，留白以 0 元建立。' : '未使用行情追蹤時必填。'}</small></label>
          <label>所有權<select name="ownershipType" value={ownershipType} onChange={(event) => setOwnershipType(event.target.value as PlannerAsset['ownershipType'])}><option value="individual">個人</option><option value="joint" disabled={data.members.length < 2}>共同持有</option><option value="household">家庭層級</option></select></label>
          {ownershipType === 'individual' && <label>所屬成員<select name="ownerMemberId" defaultValue={editedAsset?.ownerMemberId}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
          {ownershipType === 'joint' && data.members.map((member) => <label key={member.id}>{member.name} 持分（%）<input name={`share-${member.id}`} type="number" min="0" max="100" step="0.01" defaultValue={Number(editedAsset?.owners?.find((owner) => owner.memberId === member.id)?.share ?? 0) * 100 || undefined} /></label>)}
        </div><details className="advanced-settings asset-prediction-settings" open={predictionSettingsOpen} onToggle={(event) => setPredictionSettingsOpen(event.currentTarget.open)}><summary>投資預測與行情設定（選填）</summary><h3>投資預測相關設定</h3><p className="muted">分類與報酬不代表已加入預測。儲存後請到「投資組合」選取。</p><div className="form-grid two">
          <label>投資配置分類<select name="allocationClass" value={allocationClass} onChange={(event) => { setAllocationClass(event.target.value as NonNullable<PlannerAsset['allocationClass']>); setAllocationMode('manual') }}><option value="stock">股票</option><option value="bond">債券</option><option value="moneyMarket">貨幣市場</option><option value="cash">現金</option><option value="other">其他</option></select><small>{allocationMode === 'auto' ? '依資產類型自動帶入，可手動修改。' : '已自訂分類。'} {allocationMode === 'manual' && <button className="inline-action" type="button" onClick={() => { setAllocationMode('auto'); setAllocationClass(defaultAllocationClassForAssetType(assetType)) }}>恢復系統自動分類</button>}</small></label>
          <label>資產幣別<select value={assetCurrency} onChange={(event) => { setAssetCurrency(event.target.value); if (event.target.value !== 'TWD') setMarketTracking(false) }}><option value="TWD">TWD 新台幣</option><option value="USD">USD 美元</option>{!['TWD', 'USD'].includes(assetCurrency) && <option value={assetCurrency}>{assetCurrency}</option>}</select></label>
          {assetCurrency !== 'TWD' && <label>匯率（1 {assetCurrency} 換多少 TWD）<input key={assetCurrency} name="exchangeRate" type="number" min="0.000001" step="any" required defaultValue={exchangeRateFor(data, assetCurrency)?.rate} /><small>套用所有同幣別資產。{exchangeRateFor(data, assetCurrency) ? '來源：' + exchangeRateFor(data, assetCurrency)?.sourceId + ' · ' + exchangeRateFor(data, assetCurrency)?.asOf : '請手動填寫；行情更新可取得央行 USD/TWD 匯率。'} 修改後記錄為手動匯率；預測期間固定使用此匯率。</small></label>}
          <label>報酬設定<select name="returnProfileId" defaultValue={editedAsset ? editedAsset.returnProfileId ?? '' : 'balanced'}><option value="">未設定報酬（以 0% 計算）</option>{data.assumptions.returnProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        </div><fieldset><legend>情境報酬來源</legend><label className="checkbox-row"><input type="radio" checked={assetRateMode === 'system'} onChange={() => { setAssetRateMode('system'); setApplySystemPreset(true) }} />使用系統預設（{resolveAssetReturnPresetKey(assetType, allocationClass)}）</label><p className="muted">保守 {Number(data.assumptions.assetReturnPresets.find((item) => item.key === resolveAssetReturnPresetKey(assetType, allocationClass))?.scenarioRates.conservative ?? 0) * 100}%／穩健 {Number(data.assumptions.assetReturnPresets.find((item) => item.key === resolveAssetReturnPresetKey(assetType, allocationClass))?.scenarioRates.balanced ?? 0) * 100}%／樂觀 {Number(data.assumptions.assetReturnPresets.find((item) => item.key === resolveAssetReturnPresetKey(assetType, allocationClass))?.scenarioRates.optimistic ?? 0) * 100}%</p><label className="checkbox-row"><input type="radio" checked={assetRateMode === 'custom'} onChange={() => setAssetRateMode('custom')} />自訂此資產的三種情境報酬</label>{assetRateMode === 'custom' && <div className="form-grid three">{([['conservative', '保守年報酬（%）'], ['balanced', '穩健年報酬（%）'], ['optimistic', '比較樂觀年報酬（%）']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min="-99" max="100" step="any" required value={customRates[key]} onChange={(event) => setCustomRates({ ...customRates, [key]: event.target.value })} /><small>填年報酬率，可為 0 或負數。</small></label>)}</div>}<button className="button small secondary" type="button" onClick={() => { setAssetRateMode('system'); setApplySystemPreset(true) }}>重新套用系統預設</button></fieldset>{isMarketTrackableAssetType(assetType) && assetCurrency === 'TWD' && <fieldset><legend>行情追蹤</legend><label className="checkbox-row"><input type="checkbox" checked={marketTracking} onChange={(event) => setMarketTracking(event.target.checked)} />使用市場行情更新目前價值</label>{marketTracking && <div className="form-grid three"><label>上市代碼<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} pattern="\d{4,6}[A-Z]?" placeholder="例如 0050" required /></label><label>持有數量<input name="quantity" type="number" min="0" step="any" defaultValue={editedAsset && data.holdings.find((item) => item.assetId === editedAsset.id)?.quantity} required /></label><label>所屬帳戶（選填）<select name="accountId" defaultValue={editedAsset?.accountId}><option value="">行情追蹤帳戶</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div>}<p className="muted">儲存後可直接到行情頁更新，不需要再次設定。目前支援臺灣證券交易所可取得的股票與 ETF。</p></fieldset>}</details><details className="advanced-settings"><summary>進階資產設定（選填）</summary><div className="context-help-row"><CalculationHelp label="可動用日期" topic="availableFrom" /><CalculationHelp label="退休使用範圍" topic="retirementScope" /></div><div className="form-grid three">
          <label>設定狀態<select name="status" defaultValue={editedAsset?.status ?? 'provided'}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>只表示資料是否完成設定；是否納入計算仍依下方範圍設定判斷。</small></label>
          <label>退休使用範圍<select name="retirementUsageScope" defaultValue={editedAsset?.retirementUsageScope}><option value="personal">個人退休使用</option><option value="household">家庭退休可用</option><option value="excluded">不納入退休</option></select></label>
          <label>可動用日期<input name="availableFrom" type="date" required defaultValue={editedAsset?.availableFrom ?? data.calculationBaseDate} /></label>
          {!marketTracking && <label>所屬帳戶<select name="accountId" defaultValue={editedAsset?.accountId}><option value="">未指定</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}
          <label>地區<select name="region" defaultValue={editedAsset?.region}><option value="">未指定</option><option value="taiwan">臺灣</option><option value="global">全球</option><option value="us">美國</option><option value="other">其他</option></select></label>
          <label>風險分類<select name="riskLevel" defaultValue={editedAsset?.riskLevel}><option value="">未指定</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
          <label>不動產地址（選填）<input name="propertyAddress" defaultValue={editedAsset?.propertyAddress} /></label>
          <label className="checkbox-row"><input name="includeInTotalAssets" type="checkbox" defaultChecked={editedAsset?.includeInTotalAssets ?? true} /><span>納入總資產</span></label>
        </div></details>{error && <div className="field-error" role="alert">{error}</div>}<div className="form-actions mobile-sticky-actions"><button className="button ghost" type="button" onClick={() => setAssetEditor(null)}>取消</button><button className="button primary" type="submit">儲存資產</button></div>
      </form>}
      <div className="data-list">{data.assets.map((asset) => <article key={asset.id}><div><strong>{asset.name}</strong><p>{statusLabels[asset.status]} · {asset.retirementUsageScope === 'household' ? '家庭退休可用' : asset.retirementUsageScope === 'personal' ? '個人退休使用' : '已排除'}</p></div><strong>{formatMoney(asset.currentValue)}{asset.currentValue.currency !== 'TWD' && <small>{moneyToTwd(data, asset.currentValue) ? '約 ' + currency.format(moneyToTwd(data, asset.currentValue)!.toNumber()) : '缺少匯率，尚未納入台幣合計'}</small>}</strong><button className="icon-button" aria-label={`編輯 ${asset.name}`} onClick={() => editAsset(asset)}><Pencil size={18} /></button><button className="icon-button danger" aria-label={`刪除 ${asset.name}`} onClick={() => { const instrumentIds = new Set(data.instruments.filter((item) => item.assetId === asset.id).map((item) => item.id)); void onChange({ ...data, assets: data.assets.filter((item) => item.id !== asset.id), contributions: data.contributions.filter((item) => item.destinationAssetId !== asset.id), holdings: data.holdings.filter((item) => item.assetId !== asset.id), instruments: data.instruments.filter((item) => item.assetId !== asset.id), marketQuotes: data.marketQuotes.filter((item) => !instrumentIds.has(item.instrumentId)) }) }}><Trash2 size={18} /></button></article>)}{data.assets.length === 0 && <div className="empty-state">尚未建立資產。至少加入一筆資產或明確的 0 元起始資產。</div>}</div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h2>每月可投入資金</h2><p>只有在這裡建立的投入才會加入預測，一般收入不會自動算成投資。每月先計息，再加入當月投入。</p></div><button className="button secondary" onClick={() => editContribution()}><Plus size={18} /> 新增投入</button></div>
      <p className="muted">結束日期包含當月；舊設定的停止月份本身不再投入。若依成員退休日期停止但日期未填，會持續投入至 35 年後。</p>
      {contributionEditor && <form key={contributionEditor} className="editor-form" onSubmit={saveContribution}>
        <div className="context-help-row" aria-label="投入欄位說明"><CalculationHelp label="每月投入" topic="contribution" /><CalculationHelp label="停止規則" topic="contributionEnd" /></div>
        <div className="form-grid three">
          <label>投入名稱（選填）<input name="contributionName" defaultValue={editedContribution?.name} placeholder="例如：每月薪資投入" /></label><label>來源成員<select name="sourceMemberId" defaultValue={editedContribution?.sourceMemberId}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label>每月金額（TWD）<input name="amount" type="number" min="0" step="0.01" required defaultValue={editedContribution?.amount.amount} /></label>
          <label>設定狀態<select name="status" defaultValue={editedContribution?.status ?? 'provided'}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>只表示資料是否完成設定；是否納入計算仍依投入與資產範圍判斷。</small></label>
          <label>使用範圍<select name="usageScope" defaultValue={editedContribution?.usageScope ?? 'household'}><option value="personal">來源成員個人</option><option value="household">家庭退休可用</option></select></label>
          <label>開始日期<input name="startDate" type="date" required defaultValue={editedContribution?.startDate ?? data.calculationBaseDate} /></label>
          <label>停止規則<select name="endRule" value={endRule} onChange={(event) => setEndRule(event.target.value as PlannerContribution['endRule'])}><option value="ownerRetirement">來源成員退休時</option><option value="primaryRetirement">主要規劃人退休時</option><option value="fixedDate">指定結束時間</option><option value="planEnd">持續投入至 35 年後</option></select></label>
          {endRule === 'fixedDate' && <><label>結束時間格式<select value={endDateMode} onChange={(event) => setEndDateMode(event.target.value as 'date' | 'month')}><option value="date">結束日期（含當月）</option><option value="month">停止月份（不含當月，沿用舊設定）</option></select></label><label>{endDateMode === 'date' ? '結束日期' : '固定停止月份'}<input key={endDateMode} name="endDate" type={endDateMode} required defaultValue={editedContribution?.endDate?.length === (endDateMode === 'date' ? 10 : 7) ? editedContribution.endDate : undefined} /><small>{endDateMode === 'date' ? '按月計算，開始與結束日期所在月份各投入一次，不按日拆分。' : '停止月份本身不再投入。'}</small></label></>}
          <label>投入目的<select value={destinationKind} onChange={(event) => setDestinationKind(event.target.value as 'asset' | 'profile')}><option value="asset">指定資產</option><option value="profile">報酬設定</option></select></label>
          {destinationKind === 'asset' ? <label>目的資產<select name="destinationAssetId" required defaultValue={editedContribution?.destinationAssetId}>{data.assets.filter((asset) => asset.retirementUsageScope !== 'excluded').map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label> : <label>報酬設定<select name="returnProfileId" required defaultValue={editedContribution?.returnProfileId}>{data.assumptions.returnProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}
        </div>{error && <div className="field-error" role="alert">{error}</div>}<div className="form-actions mobile-sticky-actions"><button className="button ghost" type="button" onClick={() => setContributionEditor(null)}>取消</button><button className="button primary" type="submit">儲存投入</button></div>
      </form>}
      <div className="data-list">{data.contributions.map((contribution) => { const member = data.members.find((item) => item.id === contribution.sourceMemberId); const asset = data.assets.find((item) => item.id === contribution.destinationAssetId); const profile = data.assumptions.returnProfiles.find((item) => item.id === contribution.returnProfileId); return <article key={contribution.id}><div><strong>{contribution.name || (member?.name ?? '未指定成員') + ' 每月投入'}</strong><p>{contribution.startDate} 起 · 投向 {asset?.name ?? profile?.name} · {contribution.endRule === 'fixedDate' ? `${contribution.endDate} ${contribution.endDate?.length === 10 ? '結束（含當月）' : '停止'}` : contribution.endRule === 'ownerRetirement' ? '本人退休時停止' : contribution.endRule === 'primaryRetirement' ? '主要規劃人退休時停止' : '持續至規劃終點'}</p></div><strong>{formatMoney(contribution.amount)}</strong><button className="icon-button" aria-label="編輯每月投入" onClick={() => editContribution(contribution)}><Pencil size={18} /></button><button className="icon-button danger" aria-label="刪除每月投入" onClick={() => void onChange({ ...data, contributions: data.contributions.filter((item) => item.id !== contribution.id) })}><Trash2 size={18} /></button></article> })}{data.contributions.length === 0 && <div className="empty-state">目前沒有每月投入；這不會阻止使用現有資產進行試算。</div>}</div>
    </section>
    <FinancialDataSections data={data} onChange={onChange} />
  </div>
}
