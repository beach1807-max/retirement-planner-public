import { describe, expect, it } from 'vitest'
import type { ProjectionInput } from './models'
import { projectRetirement } from './projection-engine'

function fixture(): ProjectionInput {
  return {
    contractVersion: 'projection-contract-v0.2', calculationBaseDate: '2026-09-01', annualInflationRate: '0.02',
    assets: [{ id: 'portfolio', name: '投資組合', currentValueTwd: '1000000', annualReturnRate: '0.06', availableFrom: '2026-09-01', status: 'provided' }],
    contributions: [{ id: 'monthly', amountTwd: '10000', annualReturnRate: '0.06', startMonth: '2026-09', status: 'provided' }],
    laborPensions: [{ id: 'labor', memberName: '主要規劃人', currentBalanceTwd: '500000', monthlyContributionTwd: '6000', annualReturnRate: '0.03', claimMonth: '2056-09', status: 'provided' }],
  }
}

describe('固定期間投資與勞退預測', () => {
  it('輸出六個固定期間與保守、穩健、樂觀三種情境', async () => {
    const result = await projectRetirement(fixture())
    expect(result.contractVersion).toBe('projection-contract-v0.2')
    expect(result.horizons).toEqual([10, 15, 20, 25, 30, 35])
    expect(result.scenarios.map((item) => item.id)).toEqual(['conservative', 'balanced', 'optimistic'])
    expect(result.scenarios.every((item) => item.milestones.length === 6)).toBe(true)
  })

  it('每個節點分開輸出投資、勞退、名目合計與今天購買力', async () => {
    const result = await projectRetirement(fixture())
    const milestone = result.scenarios[1].milestones[0]
    expect(Number(milestone.investmentAssetsNominal)).toBeGreaterThan(1000000)
    expect(Number(milestone.laborPensionAssetsNominal)).toBeGreaterThan(500000)
    expect(Number(milestone.totalAssetsNominal)).toBe(Number(milestone.investmentAssetsNominal) + Number(milestone.laborPensionAssetsNominal))
    expect(Number(milestone.totalAssetsReal)).toBeLessThan(Number(milestone.totalAssetsNominal))
  })

  it('三種情境只改變報酬假設並保持結果順序', async () => {
    const result = await projectRetirement(fixture())
    const totals = result.scenarios.map((item) => Number(item.milestones.at(-1)?.totalAssetsNominal))
    expect(totals[0]).toBeLessThan(totals[1])
    expect(totals[1]).toBeLessThan(totals[2])
  })

  it('回傳每個情境實際採用的投資與勞退年報酬率', async () => {
    const input = fixture()
    input.assets[0].scenarioRates = { conservative: '0.01', balanced: '0.05', optimistic: '0.09' }
    input.contributions[0].annualReturnRate = '0.07'
    const result = await projectRetirement(input)
    expect(result.scenarios[1].investmentAnnualReturnRates).toEqual(['0.05', '0.07'])
    expect(result.scenarios[1].laborPensionAnnualReturnRates).toEqual(['0.03'])
  })

  it('計算非固定、與固定期間重疊及超過 35 年的目標退休時間', async () => {
    for (const targetRetirementMonth of ['2048-06', '2046-09', '2064-03']) {
      const input = fixture()
      input.targetRetirementMonth = targetRetirementMonth
      const result = await projectRetirement(input)
      expect(result.targetRetirementMonth).toBe(targetRetirementMonth)
      expect(result.scenarios.every((scenario) => scenario.targetRetirementMilestone?.month === targetRetirementMonth)).toBe(true)
      expect(result.scenarios.every((scenario) => scenario.milestones.length === 6)).toBe(true)
    }
  })

  it('目標退休時間早於計算基準或缺少時不建立退休節點', async () => {
    const input = fixture()
    input.targetRetirementMonth = '2026-08'
    const result = await projectRetirement(input)
    expect(result.targetRetirementMonth).toBeUndefined()
    expect(result.scenarios.every((scenario) => scenario.targetRetirementMilestone === undefined)).toBe(true)
    const withoutTarget = await projectRetirement(fixture())
    expect(withoutTarget.targetRetirementMonth).toBeUndefined()
  })

  it('未提供的投資資料不視為零並產生提醒', async () => {
    const input = fixture()
    input.assets[0].status = 'notProvided'
    const result = await projectRetirement(input)
    expect(result.includedAssetIds).toEqual([])
    expect(result.excludedAssets[0].reason).toContain('尚未設定')
    expect(result.warnings[0].code).toBe('ASSET_NOT_PROVIDED')
  })
})
