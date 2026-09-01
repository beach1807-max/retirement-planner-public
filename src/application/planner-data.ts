import type {
  Asset,
  Assumptions,
  Contribution,
  Household,
  Member,
  RetirementPlan,
} from '../domain/models'

export interface PlannerData {
  schemaVersion: 'planner-data-v0.1'
  calculationBaseDate: string
  household: Household
  members: Member[]
  assets: Asset[]
  contributions: Contribution[]
  retirementPlan: RetirementPlan
  assumptions: Assumptions
  updatedAt: string
}

export function createStarterData(input: {
  householdName: string
  primaryName: string
  primaryBirthDate: string
  planningEndAge: number
  partnerName?: string
  partnerBirthDate?: string
  calculationBaseDate: string
}): PlannerData {
  const householdId = crypto.randomUUID()
  const primaryId = crypto.randomUUID()
  const members: Member[] = [{
    id: primaryId,
    householdId,
    name: input.primaryName,
    role: 'primary',
    birthDate: input.primaryBirthDate,
    planningEndAge: input.planningEndAge,
    isActive: true,
  }]
  if (input.partnerName && input.partnerBirthDate) {
    members.push({
      id: crypto.randomUUID(),
      householdId,
      name: input.partnerName,
      role: 'partner',
      birthDate: input.partnerBirthDate,
      planningEndAge: input.planningEndAge,
      isActive: true,
    })
  }
  return {
    schemaVersion: 'planner-data-v0.1',
    calculationBaseDate: input.calculationBaseDate,
    household: { id: householdId, name: input.householdName, baseCurrency: 'TWD', primaryMemberId: primaryId },
    members,
    assets: [],
    contributions: [],
    retirementPlan: {
      earliestRetirementMonth: input.calculationBaseDate.slice(0, 7),
      retirementExpenseMonthlyRealTwd: '50000',
      safetyReserveRealTwd: '0',
      legacyTargetRealTwd: '0',
      defaultReturnProfileId: 'balanced',
      oneTimeExpenses: [],
    },
    assumptions: {
      annualInflationRate: '0.02',
      returnProfiles: [
        { id: 'cash', name: '現金／保守 1.5%', annualReturnRate: '0.015' },
        { id: 'balanced', name: '基準 6%', annualReturnRate: '0.06' },
        { id: 'growth', name: '成長 8%', annualReturnRate: '0.08' },
      ],
    },
    updatedAt: new Date().toISOString(),
  }
}

export function createDemoData(calculationBaseDate: string): PlannerData {
  const data = createStarterData({
    householdName: '林家退休計畫',
    primaryName: '主要規劃人 A',
    primaryBirthDate: '1990-09-01',
    planningEndAge: 90,
    partnerName: '伴侶 B',
    partnerBirthDate: '1992-03-15',
    calculationBaseDate,
  })
  const [primary, partner] = data.members
  data.assets = [
    {
      id: crypto.randomUUID(), householdId: data.household.id, name: '退休投資帳戶', assetType: 'stockEtf', ownershipType: 'individual',
      ownerMemberId: primary.id, currentValueTwd: '5000000', includeInTotalAssets: true, retirementUsageScope: 'personal',
      availableFrom: calculationBaseDate, returnProfileId: 'balanced', status: 'provided',
    },
    {
      id: crypto.randomUUID(), householdId: data.household.id, name: '伴侶家庭可用資產', assetType: 'stockEtf', ownershipType: 'individual',
      ownerMemberId: partner.id, currentValueTwd: '1000000', includeInTotalAssets: true, retirementUsageScope: 'household',
      availableFrom: calculationBaseDate, returnProfileId: 'balanced', status: 'provided',
    },
  ]
  data.contributions = [
    {
      id: crypto.randomUUID(), householdId: data.household.id, sourceMemberId: primary.id, amountTwd: '30000', usageScope: 'household',
      startDate: calculationBaseDate, endRule: 'ownerRetirement', destinationAssetId: data.assets[0].id, status: 'provided',
    },
    {
      id: crypto.randomUUID(), householdId: data.household.id, sourceMemberId: partner.id, amountTwd: '10000', usageScope: 'household',
      startDate: calculationBaseDate, endRule: 'primaryRetirement', destinationAssetId: data.assets[1].id, status: 'provided',
    },
  ]
  return data
}
