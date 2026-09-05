import Decimal from 'decimal.js'
import { addMonths } from '../domain/date'
import { calculateRetirement } from '../domain/calculation-engine'
import { projectRetirement } from '../domain/projection-engine'
import { estimateRetirementSystem, TAIWAN_LABOR_RULES_2026, type RetirementSystemEstimate } from '../domain/retirement-system'
import { calculateRebalancing, type RebalancingResult } from '../domain/rebalancing-engine'
import type { Asset, CalculationInput, CalculationResult, Contribution, Household, Member, ProjectionInput, ProjectionResult } from '../domain/models'
import type { PlannerRepository } from '../infrastructure/planner-repository'
import { migratePlannerData } from './planner-migration'
import type { MoneyAmount, OwnershipFields, PlannerData } from './planner-data'

export type DashboardScope = 'household' | 'primary' | 'partner'
export interface ProjectionOptions {
  scope?: { kind: 'asset' | 'class'; value: string }
  customScenario?: ProjectionInput['customScenario']
}
export interface DashboardViewModel { scope: DashboardScope; totalAssetsTwd: string; totalLiabilitiesTwd: string; netWorthTwd: string; assetCount: number; liabilityCount: number; missingDataCount: number; retirementResultScopeLabel: string }
export interface RetirementSystemView { memberId: string; memberName: string; status: PlannerData['retirementSystems'][number]['status']; laborInsuranceEnabled: boolean; laborPensionEnabled: boolean; estimate: RetirementSystemEstimate | null }

function validateOwnership(item: OwnershipFields, memberIds: Set<string>): void {
  if (item.ownershipType === 'individual') {
    if (!item.ownerMemberId || !memberIds.has(item.ownerMemberId) || item.owners) throw new Error('INVALID_INDIVIDUAL_OWNER')
  } else if (item.ownershipType === 'joint') {
    const owners = item.owners ?? []
    if (item.ownerMemberId || owners.length < 2 || new Set(owners.map((owner) => owner.memberId)).size !== owners.length) throw new Error('INVALID_JOINT_OWNERS')
    if (owners.some((owner) => !memberIds.has(owner.memberId) || new Decimal(owner.share).lte(0))) throw new Error('INVALID_JOINT_OWNERS')
    if (!owners.reduce((sum, owner) => sum.plus(owner.share), new Decimal(0)).eq(1)) throw new Error('INVALID_JOINT_SHARE_TOTAL')
  } else if (item.ownerMemberId || item.owners) throw new Error('INVALID_HOUSEHOLD_OWNER')
}

function validateMoney(money: MoneyAmount): void {
  if (!/^[A-Z]{3}$/.test(money.currency)) throw new Error('INVALID_CURRENCY')
  if (!new Decimal(money.amount).isFinite() || new Decimal(money.amount).lt(0)) throw new Error('INVALID_AMOUNT')
}

export function validatePlannerData(data: PlannerData): void {
  const memberIds = new Set(data.members.map((member) => member.id))
  for (const asset of data.assets) {
    validateMoney(asset.currentValue)
    validateOwnership(asset, memberIds)
    if (asset.accountId && !data.accounts.some((account) => account.id === asset.accountId)) throw new Error('ASSET_ACCOUNT_NOT_FOUND')
  }
  for (const item of [...data.accounts, ...data.incomes, ...data.expenses, ...data.liabilities]) validateOwnership(item, memberIds)
  for (const income of data.incomes) validateMoney(income.monthlyAmount)
  for (const expense of data.expenses) validateMoney(expense.monthlyAmount)
  for (const liability of data.liabilities) { validateMoney(liability.currentBalance); validateMoney(liability.monthlyPayment) }
  for (const holding of data.holdings) {
    if (!data.accounts.some((account) => account.id === holding.accountId) || !data.assets.some((asset) => asset.id === holding.assetId)) throw new Error('ORPHAN_HOLDING')
    if (!new Decimal(holding.quantity).isFinite() || new Decimal(holding.quantity).lt(0)) throw new Error('INVALID_HOLDING_QUANTITY')
  }
  if (new Set(data.retirementSystems.map((item) => item.memberId)).size !== data.retirementSystems.length) throw new Error('DUPLICATE_RETIREMENT_SYSTEM')
  for (const item of data.retirementSystems) {
    if (!memberIds.has(item.memberId)) throw new Error('RETIREMENT_SYSTEM_MEMBER_NOT_FOUND')
    if (item.laborPension.claimMode !== undefined && !['lumpSum', 'monthly'].includes(item.laborPension.claimMode)) throw new Error('INVALID_LABOR_PENSION_CLAIM_MODE')
    if (item.status === 'provided' && item.laborPension.enabled && (new Decimal(item.laborPension.voluntaryContributionRate).lt(0) || new Decimal(item.laborPension.voluntaryContributionRate).gt('0.06') || new Decimal(item.laborPension.employerContributionRate).lt('0.06'))) throw new Error('INVALID_LABOR_PENSION_RATE')
  }
  for (const portfolio of data.portfolios) {
    if (portfolio.scope !== 'household' || portfolio.householdId !== data.household.id) throw new Error('INVALID_PORTFOLIO_SCOPE')
    if (new Set(portfolio.assetIds).size !== portfolio.assetIds.length || portfolio.assetIds.some((id) => !data.assets.some((asset) => asset.id === id))) throw new Error('PORTFOLIO_ASSET_NOT_FOUND')
    calculateRebalancing({ allocations: [], targets: portfolio.targets, driftThreshold: portfolio.driftThreshold })
  }
  for (const scenario of data.scenarios) {
    if (scenario.householdId !== data.household.id || scenario.version !== 'scenario-v0.1') throw new Error('INVALID_SCENARIO')
    if (scenario.overrides.additionalMonthlyContributionTwd && new Decimal(scenario.overrides.additionalMonthlyContributionTwd).lt(0)) throw new Error('INVALID_SCENARIO_CONTRIBUTION')
    if (scenario.overrides.primaryLaborPensionVoluntaryRate && (new Decimal(scenario.overrides.primaryLaborPensionVoluntaryRate).lt(0) || new Decimal(scenario.overrides.primaryLaborPensionVoluntaryRate).gt('.06'))) throw new Error('INVALID_SCENARIO_PENSION_RATE')
  }
  for (const instrument of data.instruments) {
    if (!data.assets.some((asset) => asset.id === instrument.assetId) || !/^\d{4,6}[A-Z]?$/.test(instrument.symbol)) throw new Error('INVALID_MARKET_INSTRUMENT')
    if (data.instruments.some((item) => item.id !== instrument.id && item.assetId === instrument.assetId)) throw new Error('DUPLICATE_ASSET_INSTRUMENT')
  }
  for (const quote of data.marketQuotes) if (!data.instruments.some((item) => item.id === quote.instrumentId) || new Decimal(quote.price).lt(0)) throw new Error('INVALID_MARKET_QUOTE')
  for (const rate of data.exchangeRates) if (rate.toCurrency !== 'TWD' || new Decimal(rate.rate).lte(0)) throw new Error('INVALID_EXCHANGE_RATE')
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
  const assets: Asset[] = data.assets.map((item) => ({ id: item.id, householdId: item.householdId, name: item.name, assetType: item.assetType === 'cash' || item.assetType === 'timeDeposit' ? 'cash' : item.assetType === 'stock' || item.assetType === 'etf' || item.assetType === 'stockEtf' ? 'stockEtf' : 'other', ownershipType: item.ownershipType, ownerMemberId: item.ownerMemberId, owners: item.owners, currentValueTwd: item.currentValue.amount, includeInTotalAssets: item.includeInTotalAssets, retirementUsageScope: item.retirementUsageScope, availableFrom: item.availableFrom, returnProfileId: item.returnProfileId, status: item.status }))
  const contributions: Contribution[] = data.contributions.map((item) => ({ id: item.id, householdId: item.householdId, sourceMemberId: item.sourceMemberId, amountTwd: item.amount.amount, usageScope: item.usageScope, startDate: item.startDate, endRule: item.endRule, endDate: item.endDate, destinationAssetId: item.destinationAssetId, returnProfileId: item.returnProfileId, status: item.status }))
  return { contractVersion: 'calculation-contract-v0.1', calculationId: `calculation-${data.household.id}`, calculationBaseDate: data.calculationBaseDate, household: stripHousehold(data.household), members: data.members.map(stripMember), assets, contributions, retirementPlan: data.retirementPlan, assumptions: data.assumptions, ruleVersion: data.ruleVersion }
}

export class PlannerService {
  constructor(private readonly repository: PlannerRepository) {}
  async load(): Promise<PlannerData | null> { const stored = await this.repository.load(); if (!stored) return null; const migrated = migratePlannerData(stored); validatePlannerData(migrated); if (stored !== migrated) await this.repository.save(migrated); return migrated }
  async save(data: PlannerData): Promise<PlannerData> { validatePlannerData(data); const saved = { ...data, updatedAt: new Date().toISOString() }; await this.repository.save(saved); return saved }
  clear(): Promise<void> { return this.repository.clear() }
  async calculate(data: PlannerData): Promise<CalculationResult> { return calculateRetirement(toCalculationInputV01(data)) }
  async project(data: PlannerData, options: ProjectionOptions = {}): Promise<ProjectionResult> {
    validatePlannerData(data)
    const selectedIds = new Set(data.portfolios[0]?.assetIds ?? [])
    if (options.scope) {
      for (const asset of data.assets) {
        const matches = options.scope.kind === 'asset' ? asset.id === options.scope.value : (asset.allocationClass ?? 'other') === options.scope.value
        if (!matches) selectedIds.delete(asset.id)
      }
    }
    const profiles = new Map(data.assumptions.returnProfiles.map((profile) => [profile.id, profile.annualReturnRate]))
    const input: ProjectionInput = {
      customScenario: options.customScenario,
      contractVersion: 'projection-contract-v0.2', calculationBaseDate: data.calculationBaseDate, annualInflationRate: data.assumptions.annualInflationRate,
      assets: data.assets.filter((asset) => selectedIds.has(asset.id)).map((asset) => ({ id: asset.id, name: asset.name, currentValueTwd: asset.currentValue.amount, annualReturnRate: profiles.get(asset.returnProfileId ?? '') ?? '0', availableFrom: asset.availableFrom, status: asset.currentValue.currency === 'TWD' ? asset.status : 'notProvided' })),
      contributions: data.contributions.filter((item) => !options.scope || (item.destinationAssetId && selectedIds.has(item.destinationAssetId))).map((item) => {
        const ownerRetirement = data.members.find((member) => member.id === item.sourceMemberId)?.plannedRetirementMonth
        const primaryRetirement = data.members.find((member) => member.id === data.household.primaryMemberId)?.plannedRetirementMonth
        const destinationRate = item.destinationAssetId ? profiles.get(data.assets.find((asset) => asset.id === item.destinationAssetId)?.returnProfileId ?? '') : profiles.get(item.returnProfileId ?? '')
        return { id: item.id, amountTwd: item.amount.amount, annualReturnRate: destinationRate ?? '0', startMonth: item.startDate.slice(0, 7), endMonth: item.endRule === 'fixedDate' ? item.endDate : item.endRule === 'ownerRetirement' ? ownerRetirement : item.endRule === 'primaryRetirement' ? primaryRetirement : undefined, status: item.amount.currency === 'TWD' ? item.status : 'notProvided' }
      }),
      laborPensions: (options.scope ? [] : data.retirementSystems).map((record) => {
        const member = data.members.find((item) => item.id === record.memberId)
        const pension = record.laborPension
        return { id: record.id, memberName: member?.name ?? '未知成員', currentBalanceTwd: pension.currentAccountBalanceTwd, monthlyContributionTwd: new Decimal(pension.monthlyContributionSalaryTwd).mul(new Decimal(pension.employerContributionRate).plus(pension.voluntaryContributionRate)).toString(), annualReturnRate: pension.projectedAnnualReturnRate, claimMonth: member ? addMonths(member.birthDate, pension.claimAge * 12) : data.calculationBaseDate.slice(0, 7), status: record.status === 'provided' && pension.enabled ? 'provided' : record.status === 'notProvided' ? 'notProvided' : 'notApplicable' }
      }),
    }
    const result = await projectRetirement(input)
    const unresolvedContributionEnds = data.contributions.filter((item) => input.contributions.some((included) => included.id === item.id) && item.status === 'provided' && ((item.endRule === 'ownerRetirement' && !data.members.find((member) => member.id === item.sourceMemberId)?.plannedRetirementMonth) || (item.endRule === 'primaryRetirement' && !data.members.find((member) => member.id === data.household.primaryMemberId)?.plannedRetirementMonth)))
    unresolvedContributionEnds.forEach((item) => result.warnings.push({ code: 'CONTRIBUTION_END_UNRESOLVED', message: `投入「${item.id}」未設定可解析的停止月份，本次持續計算至 35 年後。`, entityId: item.id }))
    if (!options.scope && data.assets.some((asset) => selectedIds.has(asset.id) && asset.assetType === 'retirementAccount') && data.retirementSystems.some((record) => record.status === 'provided' && record.laborPension.enabled)) result.warnings.push({ code: 'LABOR_PENSION_DUPLICATE_RISK', message: '投資組合同時包含退休帳戶與勞退專戶，請確認兩者不是同一筆餘額。' })
    return result
  }
  retirementSystems(data: PlannerData): RetirementSystemView[] {
    return data.retirementSystems.map((record) => {
      const member = data.members.find((item) => item.id === record.memberId)
      if (!member || record.status !== 'provided') return { memberId: record.memberId, memberName: member?.name ?? '未知成員', status: record.status, laborInsuranceEnabled: record.laborInsurance.enabled, laborPensionEnabled: record.laborPension.enabled, estimate: null }
      const estimate = estimateRetirementSystem(
        { birthDate: member.birthDate, averageInsuredSalaryTwd: record.laborInsurance.averageInsuredSalaryTwd, insuredYears: record.laborInsurance.insuredYears, claimAge: record.laborInsurance.claimAge },
        { claimMode: record.laborPension.claimMode, birthDate: member.birthDate, calculationBaseDate: data.calculationBaseDate, currentAccountBalanceTwd: record.laborPension.currentAccountBalanceTwd, contributionYears: record.laborPension.contributionYears, monthlyContributionSalaryTwd: record.laborPension.monthlyContributionSalaryTwd, employerContributionRate: record.laborPension.employerContributionRate, voluntaryContributionRate: record.laborPension.voluntaryContributionRate, projectedAnnualReturnRate: record.laborPension.projectedAnnualReturnRate, annualInflationRate: data.assumptions.annualInflationRate, claimAge: record.laborPension.claimAge },
      )
      return { memberId: member.id, memberName: member.name, status: record.status, laborInsuranceEnabled: record.laborInsurance.enabled, laborPensionEnabled: record.laborPension.enabled, estimate }
    })
  }
  laborRuleVersion() { return TAIWAN_LABOR_RULES_2026 }
  portfolio(data: PlannerData, portfolioId?: string): RebalancingResult | null {
    const portfolio = portfolioId ? data.portfolios.find((item) => item.id === portfolioId) : data.portfolios[0]
    if (!portfolio) return null
    const allocations = portfolio.assetIds.flatMap((id) => {
      const asset = data.assets.find((item) => item.id === id)
      if (!asset || asset.status !== 'provided' || asset.currentValue.currency !== 'TWD') return []
      return [{ assetClass: asset.allocationClass ?? 'other', valueTwd: asset.currentValue.amount }]
    })
    return calculateRebalancing({ allocations, targets: portfolio.targets, driftThreshold: portfolio.driftThreshold })
  }
  dashboard(data: PlannerData, scope: DashboardScope): DashboardViewModel {
    const member = data.members.find((item) => item.role === scope)
    const scopedValue = (money: MoneyAmount, item: OwnershipFields) => {
      if (money.currency !== 'TWD') return null
      if (scope === 'household') return new Decimal(money.amount)
      if (!member || item.ownershipType === 'household') return null
      if (item.ownershipType === 'individual') return item.ownerMemberId === member.id ? new Decimal(money.amount) : null
      const share = item.owners?.find((owner) => owner.memberId === member.id)?.share
      return share ? new Decimal(money.amount).mul(share) : null
    }
    const assets = data.assets.flatMap((asset) => asset.includeInTotalAssets && asset.status === 'provided' ? [scopedValue(asset.currentValue, asset)].filter((value): value is Decimal => value !== null) : [])
    const liabilities = data.liabilities.flatMap((item) => item.status === 'provided' ? [scopedValue(item.currentBalance, item)].filter((value): value is Decimal => value !== null) : [])
    const totalAssets = assets.reduce((sum, value) => sum.plus(value), new Decimal(0))
    const totalLiabilities = liabilities.reduce((sum, value) => sum.plus(value), new Decimal(0))
    const missingDataCount = [...data.assets, ...data.incomes, ...data.expenses, ...data.liabilities].filter((item) => item.status === 'notProvided').length
    return { scope, totalAssetsTwd: totalAssets.toFixed(2), totalLiabilitiesTwd: totalLiabilities.toFixed(2), netWorthTwd: totalAssets.minus(totalLiabilities).toFixed(2), assetCount: assets.length, liabilityCount: liabilities.length, missingDataCount, retirementResultScopeLabel: '主要規劃人的家庭退休計畫' }
  }
}
