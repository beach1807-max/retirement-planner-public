import { describe, expect, it } from 'vitest'
import { createQuickStartData } from './quick-start'
import { PlannerService, validatePlannerData } from './planner-service'

const input = { birthDate: '1990-01-01', displayName: '測試規劃', totalInvestableAssetsTwd: '1000001', monthlyContributionTwd: '25001', calculationBaseDate: '2026-09-06', allocations: { stock: '70', bond: '20', moneyMarket: '0', cash: '10', other: '0' } }
const repository = { load: async () => null, save: async () => undefined, clear: async () => undefined }

describe('快速試算資料轉換', () => {
  it('以既有 PlannerData 建立精確拆分的資產、投入與投資組合', async () => {
    const data = createQuickStartData(input)
    validatePlannerData(data)
    expect(data.assets.reduce((sum, asset) => sum + Number(asset.currentValue.amount), 0)).toBe(1_000_001)
    expect(data.contributions.reduce((sum, contribution) => sum + Number(contribution.amount.amount), 0)).toBe(25_001)
    expect(data.portfolios[0].targets.reduce((sum, target) => sum + Number(target.targetWeight), 0)).toBeCloseTo(1)
    const projection = await new PlannerService(repository).project(data)
    expect(projection.horizons).toEqual([10, 15, 20, 25, 30, 35])
    expect(projection.scenarios.map((scenario) => scenario.id)).toEqual(['conservative', 'balanced', 'optimistic'])
  })

  it.each(['99', '101'])('拒絕配置合計 %s%%', (stock) => {
    expect(() => createQuickStartData({ ...input, allocations: { ...input.allocations, stock } })).toThrow('INVALID_QUICK_START_ALLOCATION')
  })

  it('接受零元每月投入並拒絕負金額', () => {
    expect(createQuickStartData({ ...input, monthlyContributionTwd: '0' }).contributions.reduce((sum, item) => sum + Number(item.amount.amount), 0)).toBe(0)
    expect(() => createQuickStartData({ ...input, totalInvestableAssetsTwd: '-1' })).toThrow('INVALID_QUICK_START_AMOUNT')
  })
})
