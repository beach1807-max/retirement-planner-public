import { describe, expect, it } from 'vitest'
import { calculateRetirement } from '../domain/calculation-engine'
import type { CalculationInput } from '../domain/models'
import { createDemoData } from './planner-data'
import { migratePlannerData } from './planner-migration'
import { PlannerService, toCalculationInputV01, validatePlannerData } from './planner-service'

function legacyData() {
  const current = createDemoData('2026-09-01')
  return {
    ...current,
    schemaVersion: 'planner-data-v0.1',
    household: { id: current.household.id, name: current.household.name, baseCurrency: 'TWD', primaryMemberId: current.household.primaryMemberId },
    members: current.members.map((member) => ({ id: member.id, householdId: member.householdId, name: member.name, role: member.role, birthDate: member.birthDate, planningEndAge: member.planningEndAge, plannedRetirementMonth: member.plannedRetirementMonth, isActive: member.isActive })),
    assets: current.assets.map((asset) => ({ id: asset.id, householdId: asset.householdId, name: asset.name, assetType: asset.assetType, ownershipType: asset.ownershipType, ownerMemberId: asset.ownerMemberId, owners: asset.owners, currentValueTwd: asset.currentValue.amount, includeInTotalAssets: asset.includeInTotalAssets, retirementUsageScope: asset.retirementUsageScope, availableFrom: asset.availableFrom, returnProfileId: asset.returnProfileId, status: asset.status })),
    contributions: current.contributions.map((item) => ({ id: item.id, householdId: item.householdId, sourceMemberId: item.sourceMemberId, amountTwd: item.amount.amount, usageScope: item.usageScope, startDate: item.startDate, endRule: item.endRule, endDate: item.endDate, destinationAssetId: item.destinationAssetId, returnProfileId: item.returnProfileId, status: item.status })),
    ruleVersion: undefined,
    retirementMode: undefined,
  }
}

describe('Planner Service 與遷移', () => {
  it('v0.1 遷移使用原更新時間，且 TWD 計算輸入與結果保持一致', async () => {
    const legacy = legacyData()
    const migrated = migratePlannerData(legacy)
    expect(migrated.schemaVersion).toBe('planner-data-v0.4')
    expect(migrated.assets[0].currentValue).toEqual({ amount: '5000000', currency: 'TWD' })
    expect(migrated.assets[0].createdAt).toBe(legacy.updatedAt)
    const legacyInput = { contractVersion: 'calculation-contract-v0.1', calculationId: `calculation-${legacy.household.id}`, calculationBaseDate: legacy.calculationBaseDate, household: legacy.household, members: legacy.members, assets: legacy.assets, contributions: legacy.contributions, retirementPlan: legacy.retirementPlan, assumptions: legacy.assumptions, ruleVersion: 'rules-none-v0.1' } as CalculationInput
    const first = await calculateRetirement(legacyInput)
    const second = await calculateRetirement(toCalculationInputV01(migrated))
    expect(first.inputHash).toBe(second.inputHash)
    expect(first.monthlyTimeline).toEqual(second.monthlyTimeline)
  })

  it.each([['0.98'], ['1']])('共同持分合計不等於 100%%（第一位 %s）會被拒絕', (share) => {
    const data = createDemoData('2026-09-01')
    data.assets[0] = { ...data.assets[0], ownershipType: 'joint', ownerMemberId: undefined, owners: [{ memberId: data.members[0].id, share }, { memberId: data.members[1].id, share: '0.01' }] }
    expect(() => validatePlannerData(data)).toThrow('INVALID_JOINT_SHARE_TOTAL')
  })

  it('共同持分 100% 可依個人範圍正確摘要', () => {
    const data = createDemoData('2026-09-01')
    data.assets = [{ ...data.assets[0], ownershipType: 'joint', ownerMemberId: undefined, owners: [{ memberId: data.members[0].id, share: '0.6' }, { memberId: data.members[1].id, share: '0.4' }] }]
    const service = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })
    expect(service.dashboard(data, 'primary').totalAssetsTwd).toBe('3000000.00')
    expect(service.dashboard(data, 'partner').totalAssetsTwd).toBe('2000000.00')
    expect(service.dashboard(data, 'household').totalAssetsTwd).toBe('5000000.00')
  })

  it('非 TWD 資產在缺少匯率時阻止組裝計算輸入', () => {
    const data = createDemoData('2026-09-01')
    data.assets[0].currentValue.currency = 'USD'
    expect(() => toCalculationInputV01(data)).toThrow('FX_RATE_REQUIRED')
  })

  it('家庭與個人淨資產依持分計算，未提供與明確 0 狀態不同', () => {
    const data = createDemoData('2026-09-01')
    const primary = data.members[0]
    const timestamp = data.updatedAt
    data.assets = [{ ...data.assets[0], ownershipType: 'joint', ownerMemberId: undefined, owners: [{ memberId: primary.id, share: '0.75' }, { memberId: data.members[1].id, share: '0.25' }] }]
    data.liabilities = [
      { id: 'loan', householdId: data.household.id, name: '共同貸款', liabilityType: 'personalLoan', currentBalance: { amount: '1000000', currency: 'TWD' }, monthlyPayment: { amount: '0', currency: 'TWD' }, ownershipType: 'joint', owners: [{ memberId: primary.id, share: '0.6' }, { memberId: data.members[1].id, share: '0.4' }], status: 'provided', createdAt: timestamp, updatedAt: timestamp },
      { id: 'zero-loan', householdId: data.household.id, name: '已清償', liabilityType: 'other', currentBalance: { amount: '0', currency: 'TWD' }, monthlyPayment: { amount: '0', currency: 'TWD' }, ownershipType: 'individual', ownerMemberId: primary.id, status: 'provided', createdAt: timestamp, updatedAt: timestamp },
    ]
    const service = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })
    expect(service.dashboard(data, 'household').netWorthTwd).toBe('4000000.00')
    expect(service.dashboard(data, 'primary').netWorthTwd).toBe('3150000.00')
    expect(service.dashboard(data, 'primary').missingDataCount).toBe(1)
  })

  it('孤兒 Holding 會被拒絕，且收入不會自動變成 Contribution', () => {
    const data = createDemoData('2026-09-01')
    data.holdings = [{ id: 'holding', householdId: data.household.id, accountId: 'missing', assetId: data.assets[0].id, quantity: '1', status: 'provided', createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    expect(() => validatePlannerData(data)).toThrow('ORPHAN_HOLDING')
    data.holdings = []
    expect(toCalculationInputV01(data).contributions).toHaveLength(data.contributions.length)
  })
})
