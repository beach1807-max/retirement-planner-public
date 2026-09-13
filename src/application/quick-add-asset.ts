import Decimal from 'decimal.js'
import type { PlannerAsset, PlannerData, PlannerPortfolio } from './planner-data'
import type { ProviderQuote, ProviderRate } from '../infrastructure/market-data-provider'
import { resolveAssetReturnPresetKey } from '../domain/default-return-presets'
import { marketDefaults, normalizeMarketSymbol, type SupportedMarket } from '../domain/market-trackable'
import { exchangeRateFor } from './money'
import { upsertAssetMarketLink } from './asset-market-link'
import { validatePlannerData } from './planner-service'

export type QuickAssetType = Exclude<PlannerAsset['assetType'], 'stockEtf' | 'retirementAccount'>
export type AllocationClass = NonNullable<PlannerAsset['allocationClass']>
export const allocationLabels: Record<AllocationClass, string> = { stock: '股票', bond: '債券', moneyMarket: '貨幣市場', cash: '現金', other: '其他' }
export interface QuickAssetDraft {
  name: string
  assetType: QuickAssetType
  allocationClass: AllocationClass | ''
  currency: 'TWD' | 'USD'
  valueMode: 'value' | 'quantity'
  amount: string
  quantity: string
  price: string
  market: SupportedMarket
  symbol: string
  trackMarket: boolean
  quote?: ProviderQuote
  fetchedAt?: string
  exchangeRate: string
  providerRate?: ProviderRate
  accountId: string
  newAccountName: string
  ownershipType: PlannerAsset['ownershipType']
  ownerMemberId: string
  shares: Record<string, string>
  includeInTotalAssets: boolean
  retirementUsageScope: PlannerAsset['retirementUsageScope']
  availableFrom: string
  region: PlannerAsset['region'] | ''
  riskLevel: PlannerAsset['riskLevel'] | ''
  returnProfileId: string
  customRates?: NonNullable<PlannerAsset['scenarioRates']>
  joinPortfolio: boolean
  targets: Record<AllocationClass, string>
  targetsConfirmed: boolean
}

export function createQuickAssetDraft(data: PlannerData): QuickAssetDraft {
  return { name: '', assetType: 'stock', allocationClass: 'stock', currency: 'TWD', valueMode: 'quantity', amount: '', quantity: '', price: '', market: 'TWSE', symbol: '', trackMarket: false, exchangeRate: '', accountId: '', newAccountName: '', ownershipType: 'individual', ownerMemberId: data.household.primaryMemberId, shares: {}, includeInTotalAssets: true, retirementUsageScope: 'personal', availableFrom: data.calculationBaseDate, region: '', riskLevel: '', returnProfileId: 'balanced', joinPortfolio: true, targets: { stock: '', bond: '', moneyMarket: '', cash: '', other: '' }, targetsConfirmed: false }
}

function nonnegative(value: string, label: string): Decimal {
  try {
    const number = new Decimal(value.trim())
    if (number.isFinite() && number.gte(0)) return number
  } catch { /* 下方提供使用者可理解的欄位錯誤。 */ }
  throw new Error(`請填寫有效的${label}（不可為負數）。`)
}

export function quickAssetValue(draft: QuickAssetDraft): string {
  if (draft.valueMode === 'quantity') {
    if (!['stock', 'etf'].includes(draft.assetType)) throw new Error('此商品請使用目前估值。')
    return nonnegative(draft.quantity, '持有數量').mul(nonnegative(draft.price, '單價')).toFixed(2)
  }
  return nonnegative(draft.amount, '目前金額').toFixed(2)
}

export function buildQuickAsset(data: PlannerData, draft: QuickAssetDraft): PlannerData {
  if (!draft.name.trim()) throw new Error('請填寫資產名稱。')
  if (!draft.allocationClass) throw new Error('請確認主要投資類別。')
  if (!['TWD', 'USD'].includes(draft.currency)) throw new Error('快速新增目前僅支援台幣及美元。')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.availableFrom) || !Number.isFinite(Date.parse(draft.availableFrom)) || new Date(draft.availableFrom).toISOString().slice(0, 10) !== draft.availableFrom) throw new Error('請填寫有效的可動用日期。')
  if (draft.returnProfileId && !data.assumptions.returnProfiles.some((p) => p.id === draft.returnProfileId)) throw new Error('報酬設定已變更，請重新選擇。')
  const excluded = ['property', 'insurance'].includes(draft.assetType)
  if (excluded && draft.joinPortfolio) throw new Error('不動產及保單本次不加入投資組合與長期預測。')
  const next = structuredClone(data)
  const now = new Date().toISOString()
  const amount = quickAssetValue(draft)
  const presetKey = resolveAssetReturnPresetKey(draft.assetType, draft.allocationClass)
  const preset = next.assumptions.assetReturnPresets.find((p) => p.key === presetKey)!
  const asset: PlannerAsset = {
    id: crypto.randomUUID(), householdId: next.household.id, name: draft.name.trim(), assetType: draft.assetType,
    allocationClass: draft.allocationClass, currentValue: { amount, currency: draft.currency },
    ownershipType: draft.ownershipType, ownerMemberId: draft.ownershipType === 'individual' ? draft.ownerMemberId : undefined,
    owners: draft.ownershipType === 'joint' ? Object.entries(draft.shares).filter(([, share]) => nonnegative(share || '0', '持分').gt(0)).map(([memberId, share]) => ({ memberId, share: new Decimal(share).div(100).toString() })) : undefined,
    includeInTotalAssets: draft.includeInTotalAssets, retirementUsageScope: draft.retirementUsageScope, availableFrom: draft.availableFrom,
    returnProfileId: draft.returnProfileId || undefined, status: 'provided', region: draft.region || undefined, riskLevel: draft.riskLevel || undefined,
    scenarioRates: structuredClone(draft.customRates ?? preset.scenarioRates), scenarioRateOrigin: draft.customRates ? { type: 'custom' } : { type: 'systemPreset', presetKey }, createdAt: now, updatedAt: now,
  }
  if (draft.currency === 'USD') {
    const existing = exchangeRateFor(next, 'USD')
    const rate = draft.exchangeRate.trim() || existing?.rate || draft.providerRate?.rate || ''
    if (!nonnegative(rate, '美元匯率').gt(0)) throw new Error('美元匯率必須大於 0。')
    if (!existing || !new Decimal(existing.rate).eq(rate)) {
      const provider = !draft.exchangeRate.trim() && draft.providerRate
      next.exchangeRates = [...next.exchangeRates.filter((r) => r.fromCurrency !== 'USD'), { id: 'fx-USD-TWD', householdId: next.household.id, fromCurrency: 'USD', toCurrency: 'TWD', rate, asOf: provider ? provider.asOf : now.slice(0, 10), sourceId: provider ? provider.sourceId : 'manual', fetchedAt: now, createdAt: existing?.createdAt ?? now, updatedAt: now }]
    }
  }
  if (draft.accountId === 'new') {
    if (!draft.newAccountName.trim()) throw new Error('請填寫新帳戶名稱。')
    asset.accountId = crypto.randomUUID()
    next.accounts.push({ id: asset.accountId, householdId: next.household.id, name: draft.newAccountName.trim(), accountType: ['stock', 'etf', 'fund', 'bond'].includes(draft.assetType) ? 'brokerage' : 'other', ownershipType: 'household', status: 'provided', createdAt: now, updatedAt: now })
  } else if (draft.accountId) {
    if (!next.accounts.some((a) => a.id === draft.accountId)) throw new Error('帳戶已不存在，請重新選擇。')
    asset.accountId = draft.accountId
  }
  next.assets.push(asset)
  let result = next
  if (draft.trackMarket) {
    const symbol = normalizeMarketSymbol(draft.market, draft.symbol)
    if (draft.valueMode !== 'quantity' || !symbol || marketDefaults(draft.market).currency !== draft.currency) throw new Error('行情追蹤需要相符的市場、幣別及持有數量。')
    if (!draft.quote || draft.quote.symbol !== symbol || draft.quote.currency !== draft.currency || !nonnegative(draft.quote.price, '報價').gt(0)) throw new Error('請先取得此商品的有效報價，或改用手動估值。')
    result = upsertAssetMarketLink(next, { assetId: asset.id, enabled: true, market: draft.market, symbol, quantity: draft.quantity, accountId: asset.accountId })
    const instrument = result.instruments.find((i) => i.assetId === asset.id)!
    result.marketQuotes.push({ ...draft.quote, instrumentId: instrument.id, id: `quote-${instrument.id}`, householdId: result.household.id, fetchedAt: draft.fetchedAt ?? now, createdAt: now, updatedAt: now })
  } else if (draft.valueMode === 'quantity') {
    if (!asset.accountId) {
      let account = result.accounts.find((a) => a.id === 'manual-holdings-account')
      if (!account) {
        account = { id: 'manual-holdings-account', householdId: result.household.id, name: '未分類持有帳戶', accountType: 'brokerage', ownershipType: 'household', status: 'provided', createdAt: now, updatedAt: now }
        result.accounts.push(account)
      }
      asset.accountId = account.id
    }
    result.holdings.push({ id: crypto.randomUUID(), householdId: result.household.id, accountId: asset.accountId, assetId: asset.id, quantity: draft.quantity, status: 'provided', createdAt: now, updatedAt: now })
  }
  if (draft.joinPortfolio) {
    const portfolio = result.portfolios[0]
    if (portfolio) { portfolio.assetIds = [...new Set([...portfolio.assetIds, asset.id])]; portfolio.updatedAt = now }
    else {
      if (!draft.targetsConfirmed) throw new Error('請確認首次投資組合的目標比例，或選擇稍後設定。')
      const targets: PlannerPortfolio['targets'] = Object.entries(draft.targets).map(([assetClass, weight]) => ({ assetClass: assetClass as AllocationClass, targetWeight: nonnegative(weight || '0', '目標比例').div(100).toString() })).filter((t) => new Decimal(t.targetWeight).gt(0))
      if (!targets.reduce((sum, t) => sum.plus(t.targetWeight), new Decimal(0)).eq(1)) throw new Error('目標比例合計必須等於 100%。')
      result.portfolios.push({ id: crypto.randomUUID(), householdId: result.household.id, name: '我的投資組合', scope: 'household', assetIds: [asset.id], targets, driftThreshold: '0.05', createdAt: now, updatedAt: now })
    }
  }
  result.updatedAt = now
  validatePlannerData(result)
  return result
}

export function removeAsset(data: PlannerData, assetId: string): PlannerData {
  const next = structuredClone(data)
  const removedContributions = new Set(next.contributions.filter((c) => c.destinationAssetId === assetId).map((c) => c.id))
  const instruments = new Set(next.instruments.filter((i) => i.assetId === assetId).map((i) => i.id))
  next.assets = next.assets.filter((a) => a.id !== assetId)
  next.contributions = next.contributions.filter((c) => !removedContributions.has(c.id))
  next.holdings = next.holdings.filter((h) => h.assetId !== assetId)
  next.instruments = next.instruments.filter((i) => !instruments.has(i.id))
  next.marketQuotes = next.marketQuotes.filter((q) => !instruments.has(q.instrumentId))
  next.portfolios = next.portfolios.map((p) => ({ ...p, assetIds: p.assetIds.filter((id) => id !== assetId) }))
  next.scenarios = next.scenarios.map((s) => ({ ...s, overrides: { ...s.overrides,
    assetRates: s.overrides.assetRates?.filter((a) => a.assetId !== assetId),
    additionalContributions: s.overrides.additionalContributions?.filter((c) => c.destinationAssetId !== assetId),
    contributionOverrides: s.overrides.contributionOverrides?.filter((c) => !removedContributions.has(c.contributionId)),
  } }))
  return next
}
