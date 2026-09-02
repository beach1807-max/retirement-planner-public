import Decimal from 'decimal.js'
import { calculateRetirement } from '../domain/calculation-engine'
import type { Asset, CalculationInput, CalculationResult, Contribution, Household, Member } from '../domain/models'
import type { PlannerRepository } from '../infrastructure/planner-repository'
import { migratePlannerData } from './planner-migration'
import type { PlannerData } from './planner-data'

export type DashboardScope = 'household' | 'primary' | 'partner'
export interface DashboardViewModel { scope: DashboardScope; totalAssetsTwd: string; assetCount: number; retirementResultScopeLabel: string }

export function validatePlannerData(data: PlannerData): void {
  const memberIds = new Set(data.members.map((member) => member.id))
  for (const asset of data.assets) {
    if (!/^[A-Z]{3}$/.test(asset.currentValue.currency)) throw new Error('INVALID_CURRENCY')
    if (asset.ownershipType === 'individual') {
      if (!asset.ownerMemberId || !memberIds.has(asset.ownerMemberId) || asset.owners) throw new Error('INVALID_INDIVIDUAL_OWNER')
    } else if (asset.ownershipType === 'joint') {
      const owners = asset.owners ?? []
      if (asset.ownerMemberId || owners.length < 2 || new Set(owners.map((owner) => owner.memberId)).size !== owners.length) throw new Error('INVALID_JOINT_OWNERS')
      if (owners.some((owner) => !memberIds.has(owner.memberId) || new Decimal(owner.share).lte(0))) throw new Error('INVALID_JOINT_OWNERS')
      if (!owners.reduce((sum, owner) => sum.plus(owner.share), new Decimal(0)).eq(1)) throw new Error('INVALID_JOINT_SHARE_TOTAL')
    } else if (asset.ownerMemberId || asset.owners) throw new Error('INVALID_HOUSEHOLD_OWNER')
  }
  for (const contribution of data.contributions) {
    if (!/^[A-Z]{3}$/.test(contribution.amount.currency)) throw new Error('INVALID_CURRENCY')
    if (contribution.endRule === 'fixedDate' && (!contribution.endDate || contribution.endDate < contribution.startDate.slice(0, 7))) throw new Error('INVALID_CONTRIBUTION_END_DATE')
    if (Boolean(contribution.destinationAssetId) === Boolean(contribution.returnProfileId)) throw new Error('INVALID_CONTRIBUTION_DESTINATION')
  }
}

export function toCalculationInputV01(data: PlannerData): CalculationInput {
  validatePlannerData(data)
  if (data.assets.some((item) => item.currentValue.currency !== 'TWD') || data.contributions.some((item) => item.amount.currency !== 'TWD')) throw new Error('FX_RATE_REQUIRED')
  const stripHousehold = (item: PlannerData['household']): Household => ({ id: item.id, name: item.name, baseCurrency: item.baseCurrency, primaryMemberId: item.primaryMemberId })
  const stripMember = (item: PlannerData['members'][number]): Member => ({ id: item.id, householdId: item.householdId, name: item.name, role: item.role, birthDate: item.birthDate, planningEndAge: item.planningEndAge, plannedRetirementMonth: item.plannedRetirementMonth, isActive: item.isActive })
  const assets: Asset[] = data.assets.map((item) => ({ id: item.id, householdId: item.householdId, name: item.name, assetType: item.assetType, ownershipType: item.ownershipType, ownerMemberId: item.ownerMemberId, owners: item.owners, currentValueTwd: item.currentValue.amount, includeInTotalAssets: item.includeInTotalAssets, retirementUsageScope: item.retirementUsageScope, availableFrom: item.availableFrom, returnProfileId: item.returnProfileId, status: item.status }))
  const contributions: Contribution[] = data.contributions.map((item) => ({ id: item.id, householdId: item.householdId, sourceMemberId: item.sourceMemberId, amountTwd: item.amount.amount, usageScope: item.usageScope, startDate: item.startDate, endRule: item.endRule, endDate: item.endDate, destinationAssetId: item.destinationAssetId, returnProfileId: item.returnProfileId, status: item.status }))
  return { contractVersion: 'calculation-contract-v0.1', calculationId: `calculation-${data.household.id}`, calculationBaseDate: data.calculationBaseDate, household: stripHousehold(data.household), members: data.members.map(stripMember), assets, contributions, retirementPlan: data.retirementPlan, assumptions: data.assumptions, ruleVersion: data.ruleVersion }
}

export class PlannerService {
  constructor(private readonly repository: PlannerRepository) {}
  async load(): Promise<PlannerData | null> { const stored = await this.repository.load(); if (!stored) return null; const migrated = migratePlannerData(stored); if ((stored as unknown as { schemaVersion?: string }).schemaVersion !== migrated.schemaVersion) await this.repository.save(migrated); return migrated }
  async save(data: PlannerData): Promise<PlannerData> { validatePlannerData(data); const saved = { ...data, updatedAt: new Date().toISOString() }; await this.repository.save(saved); return saved }
  clear(): Promise<void> { return this.repository.clear() }
  calculate(data: PlannerData): Promise<CalculationResult> { return calculateRetirement(toCalculationInputV01(data)) }
  dashboard(data: PlannerData, scope: DashboardScope): DashboardViewModel {
    const member = data.members.find((item) => item.role === scope)
    const values = data.assets.flatMap((asset) => {
      if (!asset.includeInTotalAssets || asset.status !== 'provided' || asset.currentValue.currency !== 'TWD') return []
      if (scope === 'household') return [new Decimal(asset.currentValue.amount)]
      if (!member || asset.ownershipType === 'household') return []
      if (asset.ownershipType === 'individual') return asset.ownerMemberId === member.id ? [new Decimal(asset.currentValue.amount)] : []
      const share = asset.owners?.find((owner) => owner.memberId === member.id)?.share
      return share ? [new Decimal(asset.currentValue.amount).mul(share)] : []
    })
    return { scope, totalAssetsTwd: values.reduce((sum, value) => sum.plus(value), new Decimal(0)).toFixed(2), assetCount: values.length, retirementResultScopeLabel: '主要規劃人的家庭退休計畫' }
  }
}
