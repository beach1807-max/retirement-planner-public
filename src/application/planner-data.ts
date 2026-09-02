import type { Asset, Assumptions, Contribution, DataStatus, Household, Member, OwnershipType, RetirementPlan, RetirementUsageScope } from '../domain/models'

export interface MoneyAmount { amount: string; currency: string }
export interface EntityTimestamps { createdAt: string; updatedAt: string }
export type PlannerHousehold = Household & EntityTimestamps
export type PlannerMember = Member & EntityTimestamps

export interface PlannerAsset extends EntityTimestamps {
  id: string
  householdId: string
  name: string
  assetType: Asset['assetType']
  ownershipType: OwnershipType
  ownerMemberId?: string
  owners?: Asset['owners']
  currentValue: MoneyAmount
  includeInTotalAssets: boolean
  retirementUsageScope: RetirementUsageScope
  availableFrom: string
  returnProfileId?: string
  status: DataStatus
}

export interface PlannerContribution extends EntityTimestamps {
  id: string
  householdId: string
  sourceMemberId: string
  amount: MoneyAmount
  usageScope: Contribution['usageScope']
  startDate: string
  endRule: Contribution['endRule']
  endDate?: string
  destinationAssetId?: string
  returnProfileId?: string
  status: DataStatus
}

export interface PlannerData {
  schemaVersion: 'planner-data-v0.2'
  calculationBaseDate: string
  household: PlannerHousehold
  members: PlannerMember[]
  assets: PlannerAsset[]
  contributions: PlannerContribution[]
  retirementPlan: RetirementPlan
  assumptions: Assumptions
  ruleVersion: 'rules-none-v0.1'
  retirementMode: 'support-to-plan-end-v0.1'
  updatedAt: string
}

export interface StarterDataInput {
  householdName: string
  primaryName: string
  primaryBirthDate: string
  primaryPlannedRetirementMonth: string
  planningEndAge: number
  partnerName?: string
  partnerBirthDate?: string
  calculationBaseDate: string
}

export function createStarterData(input: StarterDataInput): PlannerData {
  const householdId = crypto.randomUUID()
  const primaryId = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const members: PlannerMember[] = [{ id: primaryId, householdId, name: input.primaryName, role: 'primary', birthDate: input.primaryBirthDate, planningEndAge: input.planningEndAge, plannedRetirementMonth: input.primaryPlannedRetirementMonth, isActive: true, createdAt: timestamp, updatedAt: timestamp }]
  if (input.partnerName && input.partnerBirthDate) members.push({ id: crypto.randomUUID(), householdId, name: input.partnerName, role: 'partner', birthDate: input.partnerBirthDate, planningEndAge: input.planningEndAge, isActive: true, createdAt: timestamp, updatedAt: timestamp })
  return {
    schemaVersion: 'planner-data-v0.2', calculationBaseDate: input.calculationBaseDate,
    household: { id: householdId, name: input.householdName, baseCurrency: 'TWD', primaryMemberId: primaryId, createdAt: timestamp, updatedAt: timestamp },
    members, assets: [], contributions: [],
    retirementPlan: { earliestRetirementMonth: input.calculationBaseDate.slice(0, 7), retirementExpenseMonthlyRealTwd: '50000', safetyReserveRealTwd: '0', legacyTargetRealTwd: '0', defaultReturnProfileId: 'balanced', oneTimeExpenses: [] },
    assumptions: { annualInflationRate: '0.02', returnProfiles: [{ id: 'cash', name: '現金／保守 1.5%', annualReturnRate: '0.015' }, { id: 'balanced', name: '基準 6%', annualReturnRate: '0.06' }, { id: 'growth', name: '成長 8%', annualReturnRate: '0.08' }] },
    ruleVersion: 'rules-none-v0.1', retirementMode: 'support-to-plan-end-v0.1', updatedAt: timestamp,
  }
}

export function createDemoData(calculationBaseDate: string): PlannerData {
  const retirementYear = Number(calculationBaseDate.slice(0, 4)) + 24
  const data = createStarterData({ householdName: '林家退休計畫', primaryName: '主要規劃人 A', primaryBirthDate: '1990-09-01', primaryPlannedRetirementMonth: `${retirementYear}-09`, planningEndAge: 90, partnerName: '伴侶 B', partnerBirthDate: '1992-03-15', calculationBaseDate })
  const [primary, partner] = data.members
  const timestamps = { createdAt: data.updatedAt, updatedAt: data.updatedAt }
  data.assets = [
    { id: crypto.randomUUID(), householdId: data.household.id, name: '退休投資帳戶', assetType: 'stockEtf', ownershipType: 'individual', ownerMemberId: primary.id, currentValue: { amount: '5000000', currency: 'TWD' }, includeInTotalAssets: true, retirementUsageScope: 'personal', availableFrom: calculationBaseDate, returnProfileId: 'balanced', status: 'provided', ...timestamps },
    { id: crypto.randomUUID(), householdId: data.household.id, name: '伴侶家庭可用資產', assetType: 'stockEtf', ownershipType: 'individual', ownerMemberId: partner.id, currentValue: { amount: '1000000', currency: 'TWD' }, includeInTotalAssets: true, retirementUsageScope: 'household', availableFrom: calculationBaseDate, returnProfileId: 'balanced', status: 'provided', ...timestamps },
  ]
  data.contributions = [
    { id: crypto.randomUUID(), householdId: data.household.id, sourceMemberId: primary.id, amount: { amount: '30000', currency: 'TWD' }, usageScope: 'household', startDate: calculationBaseDate, endRule: 'ownerRetirement', destinationAssetId: data.assets[0].id, status: 'provided', ...timestamps },
    { id: crypto.randomUUID(), householdId: data.household.id, sourceMemberId: partner.id, amount: { amount: '10000', currency: 'TWD' }, usageScope: 'household', startDate: calculationBaseDate, endRule: 'primaryRetirement', destinationAssetId: data.assets[1].id, status: 'provided', ...timestamps },
  ]
  return data
}
