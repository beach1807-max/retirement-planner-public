import { describe, expect, it } from 'vitest'
import { createDemoData, createStarterData } from './planner-data'
import { buildQuickAsset, createQuickAssetDraft, removeAsset, type QuickAssetDraft } from './quick-add-asset'
import { PlannerService, validatePlannerData } from './planner-service'
import { parseBackup, serializeBackup } from '../infrastructure/backup'
import { upsertAssetMarketLink } from './asset-market-link'
import { migratePlannerData } from './planner-migration'

const service = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })
function setup(overrides: Partial<QuickAssetDraft> = {}) {
  const data = createDemoData('2026-09-01')
  return { data, draft: { ...createQuickAssetDraft(data), name: '測試資產', amount: '1000', quantity: '2.5', price: '40', ...overrides } }
}
describe('快速新增共用資料與計算', () => {
  it.each([
    ['台股', 'stock', 'stock', 'TWD', 'TWSE', '2330'],
    ['台股股票 ETF', 'etf', 'stock', 'TWD', 'TWSE', '0050'],
    ['上櫃債券 ETF', 'etf', 'bond', 'TWD', 'TPEX', '00679B'],
    ['美股', 'stock', 'stock', 'USD', 'US', 'AAPL'],
    ['全球 ETF', 'etf', 'stock', 'USD', 'US', 'VT'],
    ['債券 ETF', 'etf', 'bond', 'USD', 'US', 'BND'],
  ] as const)('%s 保留形式、分類、原幣、部位與三情境', async (name, assetType, allocationClass, currency, market, symbol) => {
    const { data, draft } = setup({ name, assetType, allocationClass, currency, market, symbol, exchangeRate: '32', trackMarket: true, quote: { instrumentId: 'quick-draft', symbol, price: '40', currency, asOf: '2026-09-11', sourceId: 'test-fixture' } })
    const before = structuredClone(data)
    const next = buildQuickAsset(data, draft)
    const asset = next.assets.at(-1)!
    expect(data).toEqual(before)
    expect(asset.currentValue).toEqual({ amount: '100.00', currency })
    expect(asset).toMatchObject({ assetType, allocationClass, scenarioRateOrigin: { type: 'systemPreset', presetKey: allocationClass } })
    expect(next.instruments[0]).toMatchObject({ assetId: asset.id, instrumentType: assetType, market, currency })
    expect(next.holdings[0]).toMatchObject({ assetId: asset.id, quantity: '2.5' })
    expect(next.portfolios[0].targets).toEqual(data.portfolios[0].targets)
    expect(next.portfolios[0].assetIds).toContain(asset.id)
    expect(Number(service.dashboard(next, 'household').totalAssetsTwd) - Number(service.dashboard(data, 'household').totalAssetsTwd)).toBe(currency === 'USD' ? 3200 : 100)
    const projected = await service.project(next)
    expect(projected.includedAssetIds).toContain(asset.id)
    expect(projected.scenarios).toHaveLength(3)
    const restored = parseBackup(serializeBackup(next))
    expect(await service.project(restored)).toEqual(projected)
    expect(service.portfolio(restored)).toEqual(service.portfolio(next))
    expect(service.dashboard(restored, 'household')).toEqual(service.dashboard(next, 'household'))
    expect(upsertAssetMarketLink(restored, { assetId: asset.id, enabled: true, market, symbol, quantity: '2.5' }).instruments[0].instrumentType).toBe(assetType)
    expect(migratePlannerData(next).instruments[0].instrumentType).toBe(assetType)
  })
  it.each([
    ['cash', 'cash', true], ['timeDeposit', 'cash', true], ['moneyMarketFund', 'moneyMarket', true],
    ['fund', 'bond', true], ['bond', 'bond', true], ['property', 'other', false], ['insurance', 'other', false], ['other', 'other', false],
  ] as const)('%s 估值無假行情，納入範圍正確', async (assetType, allocationClass, joinPortfolio) => {
    const { data, draft } = setup({ assetType, allocationClass, joinPortfolio, valueMode: 'value' })
    const next = buildQuickAsset(data, draft)
    expect(next.instruments).toEqual([])
    expect(next.holdings).toEqual([])
    expect(next.accounts).toEqual([])
    const id = next.assets.at(-1)!.id
    expect((await service.project(next)).includedAssetIds.includes(id)).toBe(joinPortfolio)
    expect(Number(service.dashboard(next, 'household').totalAssetsTwd)).toBe(6001000)
  })
  it('首次組合必須確認，0 元也可明確設定目標或稍後設定', () => {
    const data = createStarterData({ householdName: '家', primaryName: '我', primaryBirthDate: '1990-01-01', planningEndAge: 90, calculationBaseDate: '2026-09-01' })
    const draft = { ...createQuickAssetDraft(data), name: '零元', amount: '0', valueMode: 'value' as const, assetType: 'cash' as const, allocationClass: 'cash' as const }
    expect(() => buildQuickAsset(data, draft)).toThrow('請確認')
    expect(buildQuickAsset(data, { ...draft, joinPortfolio: false }).portfolios).toEqual([])
    expect(() => buildQuickAsset(data, { ...draft, targetsConfirmed: true })).toThrow('100%')
    const next = buildQuickAsset(data, { ...draft, targetsConfirmed: true, targets: { stock: '33.33', bond: '33.33', cash: '33.34', other: '', moneyMarket: '' } })
    expect(service.portfolio(next)?.status).toBe('empty')
    expect(next.portfolios[0].assetIds).toEqual([next.assets[0].id])
  })
  it('手動股數建立部位、舊一般編輯保留部位，沒有假報價', () => {
    const { data, draft } = setup()
    const next = buildQuickAsset(data, draft)
    const asset = next.assets.at(-1)!
    expect(next.holdings[0].accountId).toBe(asset.accountId)
    const edited = upsertAssetMarketLink(next, { assetId: asset.id, enabled: false })
    expect(edited.holdings).toEqual(next.holdings)
    expect(parseBackup(serializeBackup(edited)).holdings).toEqual(next.holdings)
    expect(edited.marketQuotes).toEqual([])
  })
  it('同代號分開新增，不覆寫既有部位，取消草稿不改正式資料', () => {
    const { data, draft } = setup({ accountId: 'new', newAccountName: '我的券商' })
    const first = buildQuickAsset(data, draft)
    const second = buildQuickAsset(first, { ...draft, accountId: first.accounts[0].id, quantity: '9' })
    expect(first.holdings[0].quantity).toBe('2.5')
    expect(second.holdings).toHaveLength(2)
    expect(second.assets.at(-1)!.id).not.toBe(first.assets.at(-1)!.id)
    expect(second.accounts).toHaveLength(1)
  })
  it('沿用已存匯率，不以新查詢匯率覆寫；明確修改才套用全域', () => {
    const { data, draft } = setup({ currency: 'USD', exchangeRate: '32' })
    const first = buildQuickAsset(data, draft)
    const second = buildQuickAsset(first, { ...draft, exchangeRate: '', providerRate: { fromCurrency: 'USD', toCurrency: 'TWD', rate: '99', sourceId: 'test', asOf: '2026-09-13' } })
    expect(second.exchangeRates).toEqual(first.exchangeRates)
    expect(buildQuickAsset(second, { ...draft, exchangeRate: '33' }).exchangeRates[0]).toMatchObject({ rate: '33', sourceId: 'manual' })
    expect(() => buildQuickAsset(data, { ...draft, exchangeRate: '' })).toThrow('美元匯率')
  })
  it.each([
    { quantity: '-1' }, { price: 'NaN' }, { price: '' }, { price: 'Infinity' }, { name: ' ' },
    { allocationClass: '' }, { availableFrom: '2026-02-30' }, { accountId: 'missing' },
    { customRates: { conservative: '0.1', balanced: '0', optimistic: '0.2' } },
    { ownershipType: 'joint', shares: {} },
  ] satisfies Partial<QuickAssetDraft>[])('拒絕錯誤输入且不修改資料 %j', (override) => {
    const { data, draft } = setup(override)
    const before = structuredClone(data)
    expect(() => buildQuickAsset(data, draft)).toThrow()
    expect(data).toEqual(before)
  })
  it('備份保留舊 JPY 資產，新資產使用目前修改過的報酬預設', () => {
    const { data, draft } = setup()
    data.assets[0].currentValue = { amount: '10000', currency: 'JPY' }
    data.assumptions.assetReturnPresets.find((p) => p.key === 'stock')!.scenarioRates = { conservative: '.01', balanced: '.02', optimistic: '.03' }
    const next = buildQuickAsset(data, draft)
    expect(parseBackup(serializeBackup(next)).assets[0].currentValue.currency).toBe('JPY')
    expect(next.assets.at(-1)!.scenarioRates?.balanced).toBe('.02')
  })
  it('刪除資產清理所有組合及情境引用，保留無關目標與資料', () => {
    const { data, draft } = setup()
    const next = buildQuickAsset(data, draft)
    const id = next.assets[0].id
    next.scenarios[0].overrides.assetRates = [{ assetId: id, scenarioRates: { conservative: '0', balanced: '0', optimistic: '0' } }]
    next.scenarios[0].overrides.contributionOverrides = [{ contributionId: next.contributions[0].id, amountTwd: '10' }]
    next.scenarios[0].overrides.additionalContributions = [{ id: 'extra', sourceMemberId: next.members[0].id, destinationAssetId: id, amountTwd: '1', startDate: '2026-09-01', endRule: 'planEnd' }]
    const removed = removeAsset(next, id)
    expect(() => validatePlannerData(removed)).not.toThrow()
    expect(removed.portfolios[0].targets).toEqual(next.portfolios[0].targets)
    expect(removed.scenarios[0].overrides.assetRates).toEqual([])
    expect(removed.scenarios[0].overrides.additionalContributions).toEqual([])
    expect(removed.scenarios[0].overrides.contributionOverrides).toEqual([])
    expect(removed.assets.at(-1)).toEqual(next.assets.at(-1))
    expect(removed.accounts).toEqual(next.accounts)
  })
})

