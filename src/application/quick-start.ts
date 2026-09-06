import Decimal from 'decimal.js'
import { createStarterData, type PlannerAsset, type PlannerContribution, type PlannerData } from './planner-data'

export type AllocationClass = 'stock' | 'bond' | 'moneyMarket' | 'cash' | 'other'

export interface QuickStartInput {
  birthDate: string
  displayName?: string
  totalInvestableAssetsTwd: string
  monthlyContributionTwd: string
  allocations: Record<AllocationClass, string>
  calculationBaseDate: string
}

const classes: AllocationClass[] = ['stock', 'bond', 'moneyMarket', 'cash', 'other']
const assetTypes: Record<AllocationClass, PlannerAsset['assetType']> = {
  stock: 'etf', bond: 'bond', moneyMarket: 'moneyMarketFund', cash: 'cash', other: 'other',
}
const names: Record<AllocationClass, string> = {
  stock: '股票', bond: '債券', moneyMarket: '貨幣市場', cash: '現金', other: '其他',
}

function validateInput(input: QuickStartInput) {
  const total = new Decimal(input.totalInvestableAssetsTwd)
  const monthly = new Decimal(input.monthlyContributionTwd)
  const allocationTotal = classes.reduce((sum, key) => sum.plus(input.allocations[key] || 0), new Decimal(0))
  if (!input.birthDate || input.birthDate > input.calculationBaseDate) throw new Error('INVALID_QUICK_START_BIRTH_DATE')
  if (!total.isFinite() || !total.isInteger() || total.isNegative() || !monthly.isFinite() || !monthly.isInteger() || monthly.isNegative()) throw new Error('INVALID_QUICK_START_AMOUNT')
  if (classes.some((key) => !new Decimal(input.allocations[key] || 0).isFinite() || new Decimal(input.allocations[key] || 0).isNegative()) || !allocationTotal.eq(100)) throw new Error('INVALID_QUICK_START_ALLOCATION')
}

/** Splits whole TWD exactly; the final non-zero category receives any rounding remainder. */
function splitAmount(total: Decimal, allocations: Record<AllocationClass, string>) {
  const active = classes.filter((key) => new Decimal(allocations[key] || 0).gt(0))
  let assigned = new Decimal(0)
  return active.map((key, index) => {
    const amount = index === active.length - 1
      ? total.minus(assigned)
      : total.mul(allocations[key]).div(100).floor()
    assigned = assigned.plus(amount)
    return { key, amount: amount.toFixed(0) }
  })
}

export function createQuickStartData(input: QuickStartInput): PlannerData {
  validateInput(input)
  const displayName = input.displayName?.trim() || '我的退休規劃'
  const data = createStarterData({
    householdName: displayName,
    primaryName: displayName,
    primaryBirthDate: input.birthDate,
    planningEndAge: 90,
    calculationBaseDate: input.calculationBaseDate,
  })
  const timestamp = data.updatedAt
  const allocations = splitAmount(new Decimal(input.totalInvestableAssetsTwd), input.allocations)
  data.assets = allocations.map(({ key, amount }) => ({
    id: crypto.randomUUID(), householdId: data.household.id, name: `${names[key]}資產`, assetType: assetTypes[key], allocationClass: key,
    ownershipType: 'individual', ownerMemberId: data.household.primaryMemberId, currentValue: { amount, currency: 'TWD' },
    includeInTotalAssets: true, retirementUsageScope: 'personal', availableFrom: input.calculationBaseDate, returnProfileId: 'balanced', status: 'provided', createdAt: timestamp, updatedAt: timestamp,
  }))
  const assetByClass = new Map(data.assets.map((asset) => [asset.allocationClass, asset]))
  data.contributions = splitAmount(new Decimal(input.monthlyContributionTwd), input.allocations).map(({ key, amount }): PlannerContribution => ({
    id: crypto.randomUUID(), householdId: data.household.id, sourceMemberId: data.household.primaryMemberId, amount: { amount, currency: 'TWD' }, usageScope: 'personal', startDate: input.calculationBaseDate,
    endRule: 'planEnd', destinationAssetId: assetByClass.get(key)?.id, status: 'provided', createdAt: timestamp, updatedAt: timestamp,
  }))
  data.portfolios = [{
    id: crypto.randomUUID(), householdId: data.household.id, name: '我的投資組合', scope: 'household', assetIds: data.assets.map((asset) => asset.id),
    targets: classes.map((assetClass) => ({ assetClass, targetWeight: new Decimal(input.allocations[assetClass]).div(100).toString() })), driftThreshold: '0.05', createdAt: timestamp, updatedAt: timestamp,
  }]
  return data
}
