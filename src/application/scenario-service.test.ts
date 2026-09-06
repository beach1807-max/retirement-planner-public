import { describe, expect, it } from 'vitest'
import { createDemoData } from './planner-data'
import { PlannerService } from './planner-service'
import { applyScenario, ScenarioService } from './scenario-service'

const planner = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })

describe('Scenario Service', () => {
  it('套用與執行情境不修改正式資料，且相同輸入產生相同 hash', async () => {
    const data = createDemoData('2026-09-01')
    const before = JSON.stringify(data)
    const scenario = data.scenarios[1]
    expect(applyScenario(data, scenario).contributions).toHaveLength(data.contributions.length + 1)
    const service = new ScenarioService(planner)
    const first = await service.run(data, scenario)
    const second = await service.run(data, scenario)
    expect(JSON.stringify(data)).toBe(before)
    expect(first.inputHash).toBe(second.inputHash)
  })

  it('勞退資料不足時不猜測自提 6% 結果', async () => {
    const data = createDemoData('2026-09-01')
    data.retirementSystems = []
    const result = await new ScenarioService(planner).run(data, data.scenarios[2])
    expect(result.status).toBe('unavailable')
    expect(result.warnings[0]).toContain('需先提供')
  })

  it('逐一套用退休、投入、報酬、通膨與退休制度覆寫', () => {
    const data = createDemoData('2026-09-01')
    const primary = data.members[0]
    const contribution = data.contributions[0]
    const asset = data.assets[0]
    const scenario = { ...data.scenarios[0], overrides: {
      memberRetirement: [{ memberId: primary.id, plannedRetirementMonth: '2038-01' }],
      contributionOverrides: [{ contributionId: contribution.id, amountTwd: '0', startDate: '2027-01', endRule: 'fixedDate' as const, endDate: '2028-01' }],
      additionalContributions: [{ id: 'extra', sourceMemberId: primary.id, amountTwd: '5000', startDate: '2026-09-01', endRule: 'planEnd' as const, returnProfileId: data.retirementPlan.defaultReturnProfileId }],
      assetRates: [{ assetId: asset.id, scenarioRates: { conservative: '0.01', balanced: '0.02', optimistic: '0.03' } }],
      annualInflationRate: '0.03',
      retirementSystems: [{ memberId: primary.id, laborInsuranceClaimAge: 66, laborPensionVoluntaryRate: '0.05', laborPensionClaimAge: 65, laborPensionClaimMode: 'lumpSum' as const }],
    } }
    const applied = applyScenario(data, scenario)
    expect(applied.members[0].plannedRetirementMonth).toBe('2038-01')
    expect(applied.contributions.find((item) => item.id === contribution.id)).toMatchObject({ amount: { amount: '0', currency: 'TWD' }, startDate: '2027-01', endRule: 'fixedDate', endDate: '2028-01' })
    expect(applied.contributions).toHaveLength(data.contributions.length + 1)
    expect(applied.assets[0].scenarioRates).toEqual({ conservative: '0.01', balanced: '0.02', optimistic: '0.03' })
    expect(applied.assumptions.annualInflationRate).toBe('0.03')
    expect(applied.retirementSystems[0].laborPension).toMatchObject({ voluntaryContributionRate: '0.05', claimAge: 65, claimMode: 'lumpSum' })
    expect(applied.retirementSystems[0].laborInsurance.claimAge).toBe(66)
  })

  it('立即再平衡保留總額與同類資產比例', () => {
    const data = createDemoData('2026-09-01')
    const timestamp = data.updatedAt
    const primary = data.members[0]
    data.assets = [
      { ...data.assets[0], currentValue: { amount: '600', currency: 'TWD' }, allocationClass: 'stock' },
      { ...data.assets[0], id: 'stock-2', name: '股票二', currentValue: { amount: '200', currency: 'TWD' }, allocationClass: 'stock', createdAt: timestamp, updatedAt: timestamp },
      { ...data.assets[0], id: 'bond-1', name: '債券', assetType: 'bond', currentValue: { amount: '200', currency: 'TWD' }, allocationClass: 'bond', ownerMemberId: primary.id, createdAt: timestamp, updatedAt: timestamp },
    ]
    data.portfolios[0].assetIds = data.assets.map((asset) => asset.id)
    const scenario = { ...data.scenarios[0], overrides: { rebalance: { targetWeights: [{ assetClass: 'stock' as const, targetWeight: '0.6' }, { assetClass: 'bond' as const, targetWeight: '0.4' }] } } }
    const applied = applyScenario(data, scenario)
    expect(applied.assets.reduce((sum, asset) => sum + Number(asset.currentValue.amount), 0)).toBe(1000)
    expect(applied.assets[0].currentValue.amount).toBe('450')
    expect(applied.assets[1].currentValue.amount).toBe('150')
    expect(applied.assets[2].currentValue.amount).toBe('400')
  })

  it('缺少目標資產類別時回傳 unavailable 與指定錯誤碼', async () => {
    const data = createDemoData('2026-09-01')
    data.assets = [{ ...data.assets[0], allocationClass: 'stock' }]
    data.portfolios[0].assetIds = [data.assets[0].id]
    const scenario = { ...data.scenarios[0], overrides: { rebalance: { targetWeights: [{ assetClass: 'stock' as const, targetWeight: '0.7' }, { assetClass: 'bond' as const, targetWeight: '0.3' }] } } }
    const result = await new ScenarioService(planner).run(data, scenario)
    expect(result.status).toBe('unavailable')
    expect(result.warnings.join()).toContain('SCENARIO_REBALANCE_CLASS_MISSING_ASSET')
  })
})
