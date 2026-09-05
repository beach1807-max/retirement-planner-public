export type DataStatus = 'provided' | 'notProvided' | 'notApplicable'
export type OwnershipType = 'individual' | 'joint' | 'household'
export type RetirementUsageScope = 'personal' | 'household' | 'excluded'
export type ContributionEndRule =
  | 'ownerRetirement'
  | 'primaryRetirement'
  | 'fixedDate'
  | 'planEnd'

export interface Household {
  id: string
  name: string
  baseCurrency: 'TWD'
  primaryMemberId: string
}

export interface Member {
  id: string
  householdId: string
  name: string
  role: 'primary' | 'partner' | 'other'
  birthDate: string
  planningEndAge: number
  plannedRetirementMonth?: string
  isActive: boolean
}

export interface AssetOwner {
  memberId: string
  share: string
}

export interface Asset {
  id: string
  householdId: string
  name: string
  assetType: 'cash' | 'stockEtf' | 'other'
  ownershipType: OwnershipType
  ownerMemberId?: string
  owners?: AssetOwner[]
  currentValueTwd: string
  includeInTotalAssets: boolean
  retirementUsageScope: RetirementUsageScope
  availableFrom: string
  returnProfileId?: string
  status: DataStatus
}

export interface Contribution {
  id: string
  householdId: string
  sourceMemberId: string
  amountTwd: string
  usageScope: 'personal' | 'household'
  startDate: string
  endRule: ContributionEndRule
  endDate?: string
  destinationAssetId?: string
  returnProfileId?: string
  status: DataStatus
}

export interface ReturnProfile {
  id: string
  name: string
  annualReturnRate: string
}

export interface OneTimeExpense {
  id: string
  name: string
  month: string
  amountTwdReal: string
}

export interface RetirementPlan {
  earliestRetirementMonth: string
  retirementExpenseMonthlyRealTwd: string
  safetyReserveRealTwd: string
  legacyTargetRealTwd: string
  defaultReturnProfileId: string
  oneTimeExpenses: OneTimeExpense[]
}

export interface Assumptions {
  annualInflationRate: string
  returnProfiles: ReturnProfile[]
}

export interface CalculationInput {
  contractVersion: 'calculation-contract-v0.1'
  calculationId: string
  calculationBaseDate: string
  household: Household
  members: Member[]
  assets: Asset[]
  contributions: Contribution[]
  retirementPlan: RetirementPlan
  assumptions: Assumptions
  ruleVersion: string
}

export interface CalculationMessage {
  code: string
  message: string
  entityId?: string
}

export interface MonthlyTimelineItem {
  month: string
  openingAssets: string
  activatedAssets: string
  externalInflows: string
  retirementExpenses: string
  oneTimeExpenses: string
  investmentReturn: string
  contributions: string
  closingAssets: string
  closingAssetsReal: string
}

export interface IncludedDataSummary {
  assetIds: string[]
  contributionIds: string[]
}

export interface ExcludedDataSummary {
  assets: Array<{ id: string; reason: string }>
  contributions: Array<{ id: string; reason: string }>
}

export interface CalculationResult {
  calculationId: string
  contractVersion: string
  ruleVersion: string
  calculationBaseDate: string
  inputHash: string
  status: 'success' | 'notAchievableWithinHorizon' | 'error'
  earliestRetirementMonth: string | null
  retirementAgeInMonths: number | null
  retirementAssetsAtRetirement: string | null
  endingAssetsNominal: string | null
  endingAssetsReal: string | null
  monthlyTimeline: MonthlyTimelineItem[]
  warnings: CalculationMessage[]
  errors: CalculationMessage[]
  includedDataSummary: IncludedDataSummary
  excludedDataSummary: ExcludedDataSummary
}

export interface ProjectionAsset {
  id: string
  name: string
  currentValueTwd: string
  annualReturnRate: string
  availableFrom: string
  status: DataStatus
}

export interface ProjectionContribution {
  id: string
  amountTwd: string
  annualReturnRate: string
  startMonth: string
  endMonth?: string
  status: DataStatus
}

export interface ProjectionLaborPension {
  id: string
  memberName: string
  currentBalanceTwd: string
  monthlyContributionTwd: string
  annualReturnRate: string
  claimMonth: string
  status: DataStatus
}

export interface ProjectionInput {
  contractVersion: 'projection-contract-v0.2'
  calculationBaseDate: string
  annualInflationRate: string
  assets: ProjectionAsset[]
  contributions: ProjectionContribution[]
  laborPensions: ProjectionLaborPension[]
}

export interface ProjectionMilestone {
  yearsFromNow: 10 | 15 | 20 | 25 | 30 | 35
  month: string
  investmentAssetsNominal: string
  laborPensionAssetsNominal: string
  totalAssetsNominal: string
  totalAssetsReal: string
}

export interface ProjectionScenario {
  id: 'conservative' | 'balanced' | 'optimistic'
  label: string
  returnAdjustment: string
  milestones: ProjectionMilestone[]
}

export interface ProjectionResult {
  contractVersion: 'projection-contract-v0.2'
  calculationBaseDate: string
  inflationRate: string
  horizons: Array<10 | 15 | 20 | 25 | 30 | 35>
  scenarios: ProjectionScenario[]
  warnings: CalculationMessage[]
  includedAssetIds: string[]
  excludedAssets: Array<{ id: string; reason: string }>
}
