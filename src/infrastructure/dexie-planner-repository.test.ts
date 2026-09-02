import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { createDemoData } from '../application/planner-data'
import { DexiePlannerRepository } from './dexie-planner-repository'

describe('IndexedDB Repository', () => {
  const repository = new DexiePlannerRepository()

  beforeEach(async () => repository.clear())

  it('可儲存、重新讀取及清除規劃資料', async () => {
    const data = createDemoData('2026-09-01')
    await repository.save(data)
    expect(await repository.load()).toEqual(data)
    await repository.clear()
    expect(await repository.load()).toBeNull()
  })

  it('開啟 v1 IndexedDB 時會在升級 transaction 中遷移為目前版本', async () => {
    const databaseName = `retirement-planner-migration-${crypto.randomUUID()}`
    const original = createDemoData('2026-09-01')
    const legacy = {
      ...original, schemaVersion: 'planner-data-v0.1', ruleVersion: undefined, retirementMode: undefined,
      household: { id: original.household.id, name: original.household.name, baseCurrency: 'TWD', primaryMemberId: original.household.primaryMemberId },
      members: original.members.map((member) => ({ id: member.id, householdId: member.householdId, name: member.name, role: member.role, birthDate: member.birthDate, planningEndAge: member.planningEndAge, plannedRetirementMonth: member.plannedRetirementMonth, isActive: member.isActive })),
      assets: original.assets.map((asset) => ({ id: asset.id, householdId: asset.householdId, name: asset.name, assetType: asset.assetType, ownershipType: asset.ownershipType, ownerMemberId: asset.ownerMemberId, owners: asset.owners, currentValueTwd: asset.currentValue.amount, includeInTotalAssets: asset.includeInTotalAssets, retirementUsageScope: asset.retirementUsageScope, availableFrom: asset.availableFrom, returnProfileId: asset.returnProfileId, status: asset.status })),
      contributions: original.contributions.map((item) => ({ id: item.id, householdId: item.householdId, sourceMemberId: item.sourceMemberId, amountTwd: item.amount.amount, usageScope: item.usageScope, startDate: item.startDate, endRule: item.endRule, endDate: item.endDate, destinationAssetId: item.destinationAssetId, returnProfileId: item.returnProfileId, status: item.status })),
    }
    const v1 = new Dexie(databaseName)
    v1.version(1).stores({ planner: 'id, updatedAt' })
    await v1.table('planner').put({ id: 'current', data: legacy, updatedAt: legacy.updatedAt })
    v1.close()
    const upgraded = await new DexiePlannerRepository(databaseName).load()
    expect((upgraded as { schemaVersion: string }).schemaVersion).toBe('planner-data-v0.4')
    expect((upgraded as { assets: Array<{ currentValue: unknown }> }).assets[0].currentValue).toEqual({ amount: '5000000', currency: 'TWD' })
    await Dexie.delete(databaseName)
  })
})
