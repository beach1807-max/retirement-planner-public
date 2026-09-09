import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { createDemoData } from './planner-data'
import { PlannerService, toCalculationInputV01, validatePlannerData } from './planner-service'
import { contributionActiveInMonth } from './contribution-period'
import { parseBackup, serializeBackup } from '../infrastructure/backup'
import { DexiePlannerRepository } from '../infrastructure/dexie-planner-repository'
import { upsertAssetMarketLink } from './asset-market-link'
import { MarketDataService } from './market-data-service'
import { retirementEligibilityAtMonth } from '../domain/retirement-system'
import { applyScenario } from './scenario-service'

const service = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })
function fixture() {
  const data = createDemoData('2026-01-01')
  data.retirementSystems = []
  data.scenarios = []
  data.contributions = []
  data.assets.forEach((asset) => { asset.currentValue.amount = '1000'; asset.scenarioRates = { conservative: '0', balanced: '0', optimistic: '0' }; asset.returnProfileId = 'zero' })
  data.assumptions.returnProfiles.push({ id: 'zero', name: '零報酬', annualReturnRate: '0' })
  return data
}

describe('第一階段資料與計算回歸', () => {
  it.each(['stock', 'etf', 'cash'] as const)('單筆 %s 的三種情境及六個年份均有值，單筆可加總為整體', async (type) => {
    const data = fixture()
    data.assets[0].assetType = type
    const single = await service.project(data, { scope: { kind: 'asset', value: data.assets[0].id } })
    const all = await service.project(data)
    for (const scenario of single.scenarios) for (const item of scenario.milestones) expect(item.totalAssetsNominal).toBe('1000.00')
    expect(all.scenarios[1].milestones[0].totalAssetsNominal).toBe('2000.00')
  })

  it('USD 原幣保存，家庭、帳戶、配置、兩個引擎與情境使用同一匯率', async () => {
    const data = fixture()
    data.assets[0].currentValue.currency = 'USD'
    data.accounts = [{ id: 'usd-account', householdId: data.household.id, name: '美元帳戶', accountType: 'bank', ownershipType: 'household', status: 'provided', createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    data.assets[0].accountId = 'usd-account'
    data.exchangeRates = [{ id: 'usd', householdId: data.household.id, fromCurrency: 'USD', toCurrency: 'TWD', rate: '32', asOf: '2026-01-01', sourceId: 'manual', fetchedAt: data.updatedAt, createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    const restored = parseBackup(serializeBackup(data))
    expect(restored.assets[0].currentValue).toEqual({ amount: '1000', currency: 'USD' })
    expect(service.dashboard(restored, 'household').totalAssetsTwd).toBe('33000.00')
    expect(service.portfolio(restored)?.allocations.find((item) => item.assetClass === 'stock')?.valueTwd).toBe('33000.00')
    expect(toCalculationInputV01(restored).assets[0].currentValueTwd).toBe('32000.00')
    expect((await service.project(restored)).scenarios[1].milestones[0].totalAssetsNominal).toBe('33000.00')
    const next = applyScenario(restored, { ...createDemoData('2026-01-01').scenarios[0], householdId: restored.household.id, overrides: { rebalance: { targetWeights: [{ assetClass: 'stock', targetWeight: '1' }] } } })
    expect(next.assets[0].currentValue).toEqual(restored.assets[0].currentValue)
    expect(service.financialOverview(restored).assets.totalTwd).toBe('33000.00')
    expect(service.financialOverview(restored).accounts[0].totalTwd).toBe('32000.00')
  })

  it('只更新匯率也重算 USD 合計，失敗時保留匯率與原幣金額', async () => {
    const data = fixture()
    data.assets[0].currentValue.currency = 'USD'
    const market = new MarketDataService({ id: 'fixture', fetchLatest: async () => ({ quotes: [], rates: [{ fromCurrency: 'USD', toCurrency: 'TWD', rate: '31.5', asOf: '2026-01-01', sourceId: 'cbc' }], errors: [], fetchedAt: data.updatedAt }) })
    const updated = (await market.refresh(data)).data
    expect(service.dashboard(updated, 'household').totalAssetsTwd).toBe('32500.00')
    expect(updated.assets[0].currentValue).toEqual(data.assets[0].currentValue)
    const offline = new MarketDataService({ id: 'offline', fetchLatest: async () => { throw new Error('offline') } })
    expect((await offline.refresh(updated)).data.exchangeRates).toEqual(updated.exchangeRates)
  })

  it('僅有勞退仍保留尚未符合請領年齡時的帳面累積價值', async () => {
    const data = createDemoData('2026-01-01')
    data.assets = []; data.contributions = []; data.portfolios = []
    const result = await service.project(data)
    expect(result.scenarios[1].milestones[0].investmentAssetsNominal).toBe('0.00')
    expect(Number(result.scenarios[1].milestones[0].laborPensionAssetsNominal)).toBeGreaterThan(1200000)
    expect(service.retirementEligibility(data, data.members[0].id, result.scenarios[1].milestones[0].month)?.pension.eligible).toBe(false)
  })

  it('缺匯率明確提醒且不當成台幣；無效匯率不可儲存', async () => {
    const data = fixture()
    data.assets[0].currentValue.currency = 'USD'
    const result = await service.project(data)
    expect(result.warnings.some((item) => item.code === 'FX_RATE_REQUIRED')).toBe(true)
    expect(result.includedAssetIds).toEqual([data.assets[1].id])
    expect(() => toCalculationInputV01(data)).toThrow('FX_RATE_REQUIRED')
    data.exchangeRates = [{ id: 'bad', householdId: data.household.id, fromCurrency: 'USD', toCurrency: 'TWD', rate: 'NaN', asOf: '2026-01-01', sourceId: 'manual', fetchedAt: data.updatedAt, createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    expect(() => validatePlannerData(data)).toThrow('INVALID_EXCHANGE_RATE')
  })

  it.each([['2026-12-31', '1200.00'], ['2026-12', '1100.00']])('投入期間 %s 在兩個引擎一致，名稱不改變結果', async (endDate, expected) => {
    const data = fixture()
    const contribution = { ...createDemoData('2026-01-01').contributions[0], id: 'monthly', householdId: data.household.id, sourceMemberId: data.members[0].id, destinationAssetId: data.assets[0].id, amount: { amount: '100', currency: 'TWD' }, name: '薪資投入', endRule: 'fixedDate' as const, endDate }
    data.contributions = [contribution]
    data.retirementPlan.retirementExpenseMonthlyRealTwd = '0'
    const projection = await service.project(data)
    expect(new Decimal(projection.scenarios[1].milestones[0].totalAssetsNominal).minus(2000).toFixed(2)).toBe(expected)
    const calculation = await service.calculate(data)
    expect(calculation.monthlyTimeline.reduce((sum, row) => sum.plus(row.contributions), new Decimal(0)).toFixed(2)).toBe(expected)
    expect(contributionActiveInMonth(data, contribution, '2027-01')).toBe(false)
    const restored = parseBackup(serializeBackup(data))
    expect(restored.contributions[0].name).toBe('薪資投入')
    restored.contributions[0].name = '伴侶投入'
    expect((await service.project(restored)).scenarios).toEqual(projection.scenarios)
  })

  it('11902 股可經 IndexedDB、備份保存，行情更新後市值正確且現金不變', async () => {
    const data = fixture()
    const linked = upsertAssetMarketLink(data, { assetId: data.assets[0].id, enabled: true, symbol: '0050', quantity: '11902' })
    linked.contributions = [{ ...createDemoData('2026-01-01').contributions[0], sourceMemberId: data.members[0].id, householdId: data.household.id, destinationAssetId: data.assets[0].id, name: '薪資投入', endRule: 'fixedDate', endDate: '2026-12-31' }]
    const repository = new DexiePlannerRepository('stage-one-test')
    await repository.save(parseBackup(serializeBackup(linked)))
    const restored = await new PlannerService(repository).load()
    expect(restored?.holdings[0].quantity).toBe('11902')
    expect(restored?.contributions[0].endDate).toBe('2026-12-31')
    const market = new MarketDataService({ id: 'fixture', fetchLatest: async () => ({ quotes: [{ instrumentId: linked.instruments[0].id, symbol: '0050', price: '75', currency: 'TWD', asOf: '2026-01-01', sourceId: 'test' }], rates: [], errors: [], fetchedAt: data.updatedAt }) })
    const updated = (await market.refresh(restored!)).data
    expect(updated.assets[0].currentValue.amount).toBe('892650.00')
    expect(updated.assets[1]).toEqual(data.assets[1])
    await repository.clear()
  })

  it('勞保／勞退一般請領年齡與月領年資分開判定', () => {
    const input = { birthDate: '1980-01-01', calculationBaseDate: '2026-01-01', month: '2039-12', insuredYears: '20', insuranceClaimAge: 65, contributionYears: '14', pensionClaimAge: 60, pensionContributing: false }
    expect(retirementEligibilityAtMonth(input).pension.eligible).toBe(false)
    expect(retirementEligibilityAtMonth(input).insurance.eligible).toBe(false)
    const sixty = retirementEligibilityAtMonth({ ...input, month: '2040-01' })
    expect(sixty.insurance.eligible).toBe(true)
    expect(sixty.pension).toMatchObject({ eligible: true, monthlyEligible: false })
    expect(retirementEligibilityAtMonth({ ...input, month: '2040-01', contributionYears: '15' }).pension.monthlyEligible).toBe(true)
  })
})
