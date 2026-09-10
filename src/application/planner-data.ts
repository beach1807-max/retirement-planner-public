import type { AssetReturnPresetKey, AssetScenarioRates, Asset, Assumptions, Contribution, DataStatus, Household, Member, OwnershipType, RetirementPlan, RetirementUsageScope } from '../domain/models'
import { cloneDefaultAssetReturnPresets } from '../domain/default-return-presets'

export interface MoneyAmount { amount: string; currency: string }
export interface EntityTimestamps { createdAt: string; updatedAt: string }
export type PlannerHousehold = Household & EntityTimestamps
export type PlannerMember = Member & EntityTimestamps

export interface OwnershipFields {
  ownershipType: OwnershipType
  ownerMemberId?: string
  owners?: Asset['owners']
}

export interface PlannerAsset extends EntityTimestamps, OwnershipFields {
  scenarioRates?: AssetScenarioRates
  scenarioRateOrigin?: { type: 'systemPreset' | 'custom'; presetKey?: AssetReturnPresetKey }
  id: string
  householdId: string
  name: string
  assetType: 'cash' | 'timeDeposit' | 'stock' | 'etf' | 'stockEtf' | 'bond' | 'fund' | 'moneyMarketFund' | 'insurance' | 'property' | 'retirementAccount' | 'other'
  allocationClass?: 'stock' | 'bond' | 'moneyMarket' | 'cash' | 'other'
  currentValue: MoneyAmount
  includeInTotalAssets: boolean
  retirementUsageScope: RetirementUsageScope
  availableFrom: string
  returnProfileId?: string
  status: DataStatus
  accountId?: string
  region?: 'taiwan' | 'global' | 'us' | 'other'
  riskLevel?: 'low' | 'medium' | 'high'
  propertyAddress?: string
}

export interface PlannerContribution extends EntityTimestamps {
  name?: string
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

export interface PlannerAccount extends EntityTimestamps, OwnershipFields {
  id: string
  householdId: string
  name: string
  institution?: string
  accountType: 'cash' | 'bank' | 'brokerage' | 'insurance' | 'property' | 'retirement' | 'other'
  status: DataStatus
}

export interface PlannerHolding extends EntityTimestamps {
  id: string
  householdId: string
  accountId: string
  assetId: string
  quantity: string
  status: DataStatus
}

export interface PlannerIncome extends EntityTimestamps, OwnershipFields {
  id: string
  householdId: string
  name: string
  incomeType: 'salary' | 'otherFixed'
  monthlyAmount: MoneyAmount
  annualGrowthRate: string
  status: DataStatus
}

export interface PlannerExpense extends EntityTimestamps, OwnershipFields {
  id: string
  householdId: string
  name: string
  monthlyAmount: MoneyAmount
  status: DataStatus
}

export interface PlannerLiability extends EntityTimestamps, OwnershipFields {
  id: string
  householdId: string
  name: string
  liabilityType: 'mortgage' | 'personalLoan' | 'carLoan' | 'other'
  currentBalance: MoneyAmount
  monthlyPayment: MoneyAmount
  status: DataStatus
}

export interface PlannerRetirementSystem extends EntityTimestamps {
  id: string
  householdId: string
  memberId: string
  ruleVersion: 'tw-labor-rules-2026-08-20'
  status: DataStatus
  laborInsurance: {
    enabled: boolean
    averageInsuredSalaryTwd: string
    insuredYears: string
    claimAge: number
  }
  laborPension: {
    claimMode?: 'lumpSum' | 'monthly'
    enabled: boolean
    currentAccountBalanceTwd: string
    contributionYears: string
    monthlyContributionSalaryTwd: string
    employerContributionRate: string
    voluntaryContributionRate: string
    projectedAnnualReturnRate: string
    claimAge: number
  }
}

export interface PlannerPortfolio extends EntityTimestamps {
  id: string
  householdId: string
  name: string
  scope: 'household'
  assetIds: string[]
  targets: Array<{ assetClass: NonNullable<PlannerAsset['allocationClass']>; targetWeight: string }>
  driftThreshold: string
}

export interface PlannerScenario extends EntityTimestamps {
  id: string
  householdId: string
  name: string
  version: 'scenario-v0.2'
  baseDataUpdatedAt: string
  contractVersion: 'calculation-contract-v0.1'
  ruleVersion: 'tw-labor-rules-2026-08-20'
  overrides: {
    memberRetirement?: Array<{ memberId: string; plannedRetirementMonth: string }>
    contributionOverrides?: Array<{ contributionId: string; amountTwd?: string; startDate?: string; endRule?: PlannerContribution['endRule']; endDate?: string }>
    additionalContributions?: Array<{ id: string; sourceMemberId: string; amountTwd: string; startDate: string; endRule: PlannerContribution['endRule']; endDate?: string; destinationAssetId?: string; returnProfileId?: string }>
    assetRates?: Array<{ assetId: string; scenarioRates: AssetScenarioRates }>
    retirementSystems?: Array<{ memberId: string; laborInsuranceClaimAge?: number; laborPensionVoluntaryRate?: string; laborPensionClaimAge?: number; laborPensionClaimMode?: 'lumpSum' | 'monthly' }>
    annualInflationRate?: string
    rebalance?: { targetWeights: Array<{ assetClass: NonNullable<PlannerAsset['allocationClass']>; targetWeight: string }> }
  }
}

export type MarketCode = 'TWSE' | 'TPEX' | 'US'
export type MarketInstrumentType = 'stock' | 'etf'
export interface PlannerInstrument extends EntityTimestamps { id: string; householdId: string; assetId: string; symbol: string; market: MarketCode; mic?: 'XTAI' | 'ROCO' | 'XNAS' | 'XNYS' | 'ARCX' | 'US'; providerSymbol?: string; instrumentKey?: string; currency: 'TWD' | 'USD'; instrumentType?: MarketInstrumentType; timezone?: string }
export interface PlannerMarketQuote extends EntityTimestamps { id: string; householdId: string; instrumentId: string; symbol: string; price: string; currency: string; asOf: string; sourceId: string; fetchedAt: string }
export interface PlannerExchangeRate extends EntityTimestamps { id: string; householdId: string; fromCurrency: string; toCurrency: 'TWD'; rate: string; asOf: string; sourceId: string; fetchedAt: string }
export interface PlannerMarketDataStamp extends EntityTimestamps { id: string; householdId: string; providerId: string; status: 'success' | 'partial' | 'failed'; updatedAssetIds: string[]; errors: string[]; attemptedAt: string; completedAt: string }

export interface PlannerData {
  schemaVersion: 'planner-data-v0.9' | 'planner-data-v0.10'
  calculationBaseDate: string
  household: PlannerHousehold
  members: PlannerMember[]
  assets: PlannerAsset[]
  contributions: PlannerContribution[]
  accounts: PlannerAccount[]
  holdings: PlannerHolding[]
  incomes: PlannerIncome[]
  expenses: PlannerExpense[]
  liabilities: PlannerLiability[]
  retirementSystems: PlannerRetirementSystem[]
  portfolios: PlannerPortfolio[]
  scenarios: PlannerScenario[]
  instruments: PlannerInstrument[]
  marketQuotes: PlannerMarketQuote[]
  exchangeRates: PlannerExchangeRate[]
  marketDataStamps: PlannerMarketDataStamp[]
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
  primaryPlannedRetirementMonth?: string
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
    schemaVersion: 'planner-data-v0.10', calculationBaseDate: input.calculationBaseDate,
    household: { id: householdId, name: input.householdName, baseCurrency: 'TWD', primaryMemberId: primaryId, createdAt: timestamp, updatedAt: timestamp },
    members, assets: [], contributions: [], accounts: [], holdings: [], incomes: [], expenses: [], liabilities: [], retirementSystems: [], portfolios: [], scenarios: [], instruments: [], marketQuotes: [], exchangeRates: [], marketDataStamps: [],
    retirementPlan: { earliestRetirementMonth: input.calculationBaseDate.slice(0, 7), retirementExpenseMonthlyRealTwd: '50000', safetyReserveRealTwd: '0', legacyTargetRealTwd: '0', defaultReturnProfileId: 'balanced', oneTimeExpenses: [] },
    assumptions: { annualInflationRate: '0.02', returnProfiles: [{ id: 'cash', name: '現金／保守 1.5%', annualReturnRate: '0.015' }, { id: 'balanced', name: '基準 6%', annualReturnRate: '0.06' }, { id: 'growth', name: '成長 8%', annualReturnRate: '0.08' }], assetReturnPresets: cloneDefaultAssetReturnPresets() },
    ruleVersion: 'rules-none-v0.1', retirementMode: 'support-to-plan-end-v0.1', updatedAt: timestamp,
  }
}

export function createDemoData(calculationBaseDate: string): PlannerData {
  const retirementYear = Number(calculationBaseDate.slice(0, 4)) + 24
  const data = createStarterData({ householdName: '林家退休計畫', primaryName: '主要規劃人 A', primaryBirthDate: '1990-09-01', primaryPlannedRetirementMonth: `${retirementYear}-09`, planningEndAge: 90, partnerName: '伴侶 B', partnerBirthDate: '1992-03-15', calculationBaseDate })
  const [primary, partner] = data.members
  const timestamps = { createdAt: data.updatedAt, updatedAt: data.updatedAt }
  data.assets = [
    { id: crypto.randomUUID(), householdId: data.household.id, name: '退休投資帳戶', assetType: 'etf', allocationClass: 'stock', ownershipType: 'individual', ownerMemberId: primary.id, currentValue: { amount: '5000000', currency: 'TWD' }, includeInTotalAssets: true, retirementUsageScope: 'personal', availableFrom: calculationBaseDate, returnProfileId: 'balanced', status: 'provided', ...timestamps },
    { id: crypto.randomUUID(), householdId: data.household.id, name: '伴侶家庭可用資產', assetType: 'etf', allocationClass: 'stock', ownershipType: 'individual', ownerMemberId: partner.id, currentValue: { amount: '1000000', currency: 'TWD' }, includeInTotalAssets: true, retirementUsageScope: 'household', availableFrom: calculationBaseDate, returnProfileId: 'balanced', status: 'provided', ...timestamps },
  ]
  data.contributions = [
    { id: crypto.randomUUID(), householdId: data.household.id, sourceMemberId: primary.id, amount: { amount: '30000', currency: 'TWD' }, usageScope: 'household', startDate: calculationBaseDate, endRule: 'ownerRetirement', destinationAssetId: data.assets[0].id, status: 'provided', ...timestamps },
    { id: crypto.randomUUID(), householdId: data.household.id, sourceMemberId: partner.id, amount: { amount: '10000', currency: 'TWD' }, usageScope: 'household', startDate: calculationBaseDate, endRule: 'primaryRetirement', destinationAssetId: data.assets[1].id, status: 'provided', ...timestamps },
  ]
  data.incomes = [
    { id: crypto.randomUUID(), householdId: data.household.id, name: '主要薪資', incomeType: 'salary', monthlyAmount: { amount: '80000', currency: 'TWD' }, annualGrowthRate: '0.02', ownershipType: 'individual', ownerMemberId: primary.id, status: 'provided', ...timestamps },
    { id: crypto.randomUUID(), householdId: data.household.id, name: '伴侶薪資', incomeType: 'salary', monthlyAmount: { amount: '60000', currency: 'TWD' }, annualGrowthRate: '0.02', ownershipType: 'individual', ownerMemberId: partner.id, status: 'notProvided', ...timestamps },
  ]
  data.expenses = [{ id: crypto.randomUUID(), householdId: data.household.id, name: '家庭平均生活支出', monthlyAmount: { amount: '60000', currency: 'TWD' }, ownershipType: 'household', status: 'provided', ...timestamps }]
  data.liabilities = [{ id: crypto.randomUUID(), householdId: data.household.id, name: '房貸', liabilityType: 'mortgage', currentBalance: { amount: '2000000', currency: 'TWD' }, monthlyPayment: { amount: '25000', currency: 'TWD' }, ownershipType: 'household', status: 'provided', ...timestamps }]
  data.retirementSystems = data.members.map((member) => ({ id: crypto.randomUUID(), householdId: data.household.id, memberId: member.id, ruleVersion: 'tw-labor-rules-2026-08-20', status: member.role === 'primary' ? 'provided' : 'notProvided', laborInsurance: { enabled: member.role === 'primary', averageInsuredSalaryTwd: member.role === 'primary' ? '45800' : '0', insuredYears: member.role === 'primary' ? '28' : '0', claimAge: 65 }, laborPension: { enabled: member.role === 'primary', currentAccountBalanceTwd: member.role === 'primary' ? '1200000' : '0', contributionYears: member.role === 'primary' ? '15' : '0', monthlyContributionSalaryTwd: member.role === 'primary' ? '45800' : '0', employerContributionRate: '0.06', voluntaryContributionRate: '0', projectedAnnualReturnRate: '0.02', claimAge: 60 }, ...timestamps }))
  data.portfolios = [{ id: crypto.randomUUID(), householdId: data.household.id, name: '家庭可投資資產', scope: 'household', assetIds: data.assets.filter((asset) => asset.allocationClass).map((asset) => asset.id), targets: [{ assetClass: 'stock', targetWeight: '0.7' }, { assetClass: 'bond', targetWeight: '0.2' }, { assetClass: 'cash', targetWeight: '0.1' }], driftThreshold: '0.05', ...timestamps }]
  data.scenarios = [
    { id: crypto.randomUUID(), householdId: data.household.id, name: '提早兩年退休', version: 'scenario-v0.2', baseDataUpdatedAt: data.updatedAt, contractVersion: 'calculation-contract-v0.1', ruleVersion: 'tw-labor-rules-2026-08-20', overrides: { memberRetirement: [{ memberId: primary.id, plannedRetirementMonth: `${retirementYear - 2}-09` }] }, ...timestamps },
    { id: crypto.randomUUID(), householdId: data.household.id, name: '每月增加投入 10,000', version: 'scenario-v0.2', baseDataUpdatedAt: data.updatedAt, contractVersion: 'calculation-contract-v0.1', ruleVersion: 'tw-labor-rules-2026-08-20', overrides: { additionalContributions: [{ id: crypto.randomUUID(), sourceMemberId: primary.id, amountTwd: '10000', startDate: calculationBaseDate, endRule: 'planEnd', returnProfileId: data.retirementPlan.defaultReturnProfileId }] }, ...timestamps },
    { id: crypto.randomUUID(), householdId: data.household.id, name: '勞退自提 6%', version: 'scenario-v0.2', baseDataUpdatedAt: data.updatedAt, contractVersion: 'calculation-contract-v0.1', ruleVersion: 'tw-labor-rules-2026-08-20', overrides: { retirementSystems: [{ memberId: primary.id, laborPensionVoluntaryRate: '0.06' }] }, ...timestamps },
  ]
  return data
}
