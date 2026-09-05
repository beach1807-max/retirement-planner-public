import { describe, expect, it } from 'vitest'
import { createDemoData } from './planner-data'
import { PlannerService } from './planner-service'
import { parseBackup, serializeBackup } from '../infrastructure/backup'
import { estimateLaborPension } from '../domain/retirement-system'

const service = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })
describe('預測篩選與勞退模式', () => {
  it('個別資產情境直接使用指定報酬，投入沿用；自訂以穩健加減，備份保留', async () => {
    const data = createDemoData('2026-09-01')
    const asset = data.assets[0]
    asset.scenarioRates = { conservative: '-0.01', balanced: '0', optimistic: '0.005' }
    data.contributions = []
    const restored = parseBackup(serializeBackup(data))
    expect(restored.assets[0].scenarioRates).toEqual(asset.scenarioRates)
    const options = { scope: { kind: 'asset' as const, value: asset.id }, customScenario: { returnAdjustment: '0', adjustLaborPension: false } }
    const result = await service.project(restored, options)
    expect(Number(result.scenarios[2].milestones[0].investmentAssetsNominal)).toBeCloseTo(Number(asset.currentValue.amount) * 1.005 ** 10, 2)
    expect(result.scenarios[3].milestones).toEqual(result.scenarios[1].milestones)
    data.contributions = [{ ...createDemoData('2026-09-01').contributions[0], destinationAssetId: asset.id, startDate: '2026-09-01', endRule: 'planEnd', amount: { amount: '100', currency: 'TWD' } }]
    const withContribution = await service.project(data, options)
    expect(Number(withContribution.scenarios[1].milestones[0].investmentAssetsNominal)).toBe(Number(asset.currentValue.amount) + 12100)
    asset.scenarioRates.optimistic = '-0.02'
    await expect(service.project(data)).rejects.toThrow('INVALID_ASSET_SCENARIO_RATES')
  })
  it('自訂調整 0 重現穩健，調整 2 重現樂觀；勞退開關獨立', async () => {
    const data = createDemoData('2026-09-01')
    const zero = await service.project(data, { customScenario: { returnAdjustment: '0', adjustLaborPension: true } })
    expect(zero.scenarios[3].milestones).toEqual(zero.scenarios[1].milestones)
    const two = await service.project(data, { customScenario: { returnAdjustment: '0.02', adjustLaborPension: true } })
    expect(two.scenarios[3].milestones).toEqual(two.scenarios[2].milestones)
    const investmentOnly = await service.project(data, { customScenario: { returnAdjustment: '0.02', adjustLaborPension: false } })
    expect(investmentOnly.scenarios[3].milestones[0].laborPensionAssetsNominal).toEqual(two.scenarios[1].milestones[0].laborPensionAssetsNominal)
    await expect(service.project(data, { customScenario: { returnAdjustment: 'NaN', adjustLaborPension: false } })).rejects.toThrow()
  })
  it('類別與單筆的明確投入可加總，未指定資產的投入只屬整體', async () => {
    const data = createDemoData('2026-09-01')
    data.retirementSystems = []
    data.assets[0].allocationClass = 'bond'
    const first = await service.project(data, { scope: { kind: 'asset', value: data.assets[0].id } })
    const bonds = await service.project(data, { scope: { kind: 'class', value: 'bond' } })
    expect(first.scenarios).toEqual(bonds.scenarios)
    expect(first.includedAssetIds).toEqual([data.assets[0].id])
    expect(first.scenarios[1].milestones[0].laborPensionAssetsNominal).toBe('0.00')
    const original = await service.project(data)
    data.contributions.push({ ...data.contributions[0], id: 'unassigned', destinationAssetId: undefined, returnProfileId: 'balanced' })
    expect((await service.project(data, { scope: { kind: 'asset', value: data.assets[0].id } })).scenarios).toEqual(first.scenarios)
    expect(Number((await service.project(data)).scenarios[1].milestones[0].totalAssetsNominal)).toBeGreaterThan(Number(original.scenarios[1].milestones[0].totalAssetsNominal))
  })
  it('一次領模式可備份還原，舊資料未指定模式仍可估算', () => {
    const data = createDemoData('2026-09-01')
    expect(service.retirementSystems(parseBackup(serializeBackup(data)))[0].estimate?.laborPension.status).toBe('monthly')
    data.retirementSystems[0].laborPension.claimMode = 'lumpSum'
    const restored = parseBackup(serializeBackup(data))
    expect(restored.retirementSystems[0].laborPension.claimMode).toBe('lumpSum')
    expect(service.retirementSystems(restored)[0].estimate?.laborPension.status).toBe('lumpSum')
  })
  it('重現官方 200 萬、60 歲月領 8235 元範例，且不符年資時不估月領', () => {
    const base = { birthDate: '1966-09-01', calculationBaseDate: '2026-09-01', currentAccountBalanceTwd: '2000000', contributionYears: '15', monthlyContributionSalaryTwd: '0', employerContributionRate: '0.06', voluntaryContributionRate: '0', projectedAnnualReturnRate: '0', annualInflationRate: '0', claimAge: 60 }
    expect(estimateLaborPension({ ...base, claimMode: 'monthly' }).monthlyBenefitNominalTwd).toBe('8235')
    expect(estimateLaborPension({ ...base, claimMode: 'lumpSum' }).lumpSumBenefitTwd).toBe('2000000')
    expect(estimateLaborPension({ ...base, claimMode: 'monthly', contributionYears: '14' }).status).toBe('lumpSumOnly')
    expect(estimateLaborPension({ ...base, birthDate: '1970-09-01', claimMode: 'monthly', contributionYears: '14' }).status).toBe('lumpSumOnly')
  })
  it('一次領或月領不改變首頁資產合計，請領後不重複累加月領收入', async () => {
    const data = createDemoData('2026-09-01')
    const monthly = await service.project(data)
    data.retirementSystems[0].laborPension.claimMode = 'lumpSum'
    const once = await service.project(data)
    expect(once.scenarios).toEqual(monthly.scenarios)
    const amounts = once.scenarios[1].milestones.slice(-2).map((item) => item.laborPensionAssetsNominal)
    expect(amounts[0]).toBe(amounts[1])
  })
})
