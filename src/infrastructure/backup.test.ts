import { describe, expect, it } from 'vitest'
import { createDemoData } from '../application/planner-data'
import { calculateRetirement } from '../domain/calculation-engine'
import { toCalculationInputV01 } from '../application/planner-service'
import { parseBackup, serializeBackup } from './backup'

describe('JSON 備份', () => {
  it('匯出後可還原相同資料', () => {
    const original = createDemoData('2026-09-01')
    original.accounts = [{ id: 'account-1', householdId: original.household.id, name: '證券帳戶', accountType: 'brokerage', ownershipType: 'individual', ownerMemberId: original.members[0].id, status: 'provided', createdAt: original.updatedAt, updatedAt: original.updatedAt }]
    original.holdings = [{ id: 'holding-1', householdId: original.household.id, accountId: 'account-1', assetId: original.assets[0].id, quantity: '10', status: 'provided', createdAt: original.updatedAt, updatedAt: original.updatedAt }]
    expect(parseBackup(serializeBackup(original))).toEqual(original)
  })

  it('拒絕不支援的備份版本', () => {
    expect(() => parseBackup('{"backupVersion":"unknown","data":{}}')).toThrow()
  })

  it('可匯入 v0.1 備份並遷移為目前版本', () => {
    const original = createDemoData('2026-09-01')
    const data = {
      ...original, schemaVersion: 'planner-data-v0.1', ruleVersion: undefined, retirementMode: undefined,
      household: { id: original.household.id, name: original.household.name, baseCurrency: 'TWD', primaryMemberId: original.household.primaryMemberId },
      members: original.members.map((member) => ({ id: member.id, householdId: member.householdId, name: member.name, role: member.role, birthDate: member.birthDate, planningEndAge: member.planningEndAge, plannedRetirementMonth: member.plannedRetirementMonth, isActive: member.isActive })),
      assets: original.assets.map((asset) => ({ id: asset.id, householdId: asset.householdId, name: asset.name, assetType: asset.assetType, ownershipType: asset.ownershipType, ownerMemberId: asset.ownerMemberId, owners: asset.owners, currentValueTwd: asset.currentValue.amount, includeInTotalAssets: asset.includeInTotalAssets, retirementUsageScope: asset.retirementUsageScope, availableFrom: asset.availableFrom, returnProfileId: asset.returnProfileId, status: asset.status })),
      contributions: original.contributions.map((item) => ({ id: item.id, householdId: item.householdId, sourceMemberId: item.sourceMemberId, amountTwd: item.amount.amount, usageScope: item.usageScope, startDate: item.startDate, endRule: item.endRule, endDate: item.endDate, destinationAssetId: item.destinationAssetId, returnProfileId: item.returnProfileId, status: item.status })),
    }
    const restored = parseBackup(JSON.stringify({ backupVersion: 'retirement-planner-backup-v0.1', exportedAt: original.updatedAt, data }))
    expect(restored.schemaVersion).toBe('planner-data-v0.4')
    expect(restored.household.createdAt).toBe(original.updatedAt)
  })

  it('還原後可產生相同計算結果', async () => {
    const original = createDemoData('2026-09-01')
    const restored = parseBackup(serializeBackup(original))
    expect(await calculateRetirement(toCalculationInputV01(restored))).toEqual(await calculateRetirement(toCalculationInputV01(original)))
  })
})
