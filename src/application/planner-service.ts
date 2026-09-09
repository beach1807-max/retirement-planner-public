import Decimal from 'decimal.js'
import { moneyToTwd } from './money'
import { contributionActiveInMonth, contributionEndMonth } from './contribution-period'
import { addMonths } from '../domain/date'
import { calculateRetirement } from '../domain/calculation-engine'
import { projectRetirement } from '../domain/projection-engine'
import { estimateRetirementSystem, retirementEligibilityAtMonth, TAIWAN_LABOR_RULES_2026, type RetirementSystemEstimate } from '../domain/retirement-system'
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
export interface FinancialOverview {
  missingFxCurrencies: string[]
  household: { monthlyIncomeTwd?: string; monthlyExpenseTwd?: string; monthlyDebtPaymentTwd?: string; monthlyContributionTwd?: string; unallocatedTwd?: string }
  assets: { totalTwd: string; liabilitiesTwd: string; netWorthTwd: string }
  accountCount: number
  holdingCount: number
  completeness: { hasIncome: boolean; hasExpense: boolean; hasLiability: boolean; hasContribution: boolean }
  accounts: Array<{ id: string; name: string; institution?: string; accountType: string; assetCount: number; totalTwd?: string; status: 'provided' | 'notProvided' }>
}

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
  if (memberIds.size !== data.members.length || data.members.filter((member) => member.role === 'primary').length !== 1 || !data.members.some((member) => member.id === data.household.primaryMemberId && member.role === 'primary') || data.members.filter((member) => member.role === 'partner').length > 1) throw new Error('INVALID_HOUSEHOLD_MEMBERS')
  const presetKeys = new Set(data.assumptions.assetReturnPresets.map((preset) => preset.key))
  if (presetKeys.size !== data.assumptions.assetReturnPresets.length || (['cash', 'timeDeposit', 'moneyMarket', 'bond', 'stock', 'other'] as const).some((key) => !presetKeys.has(key))) throw new Error('INVALID_ASSET_RETURN_PRESETS')
  for (const preset of data.assumptions.assetReturnPresets) {
    const rates = [preset.scenarioRates.conservative, preset.scenarioRates.balanced, preset.scenarioRates.optimistic].map((rate) => new Decimal(rate))
    if (rates.some((rate) => !rate.isFinite() || rate.lt('-0.99') || rate.gt(1)) || rates[0].gt(rates[1]) || rates[1].gt(rates[2])) throw new Error('INVALID_ASSET_RETURN_PRESETS')
  }
  for (const asset of data.assets) {
    if (asset.scenarioRates) {
      const rates = [asset.scenarioRates.conservative, asset.scenarioRates.balanced, asset.scenarioRates.optimistic].map((rate) => new Decimal(rate))
      if (rates.some((rate) => !rate.isFinite() || rate.lt('-0.99') || rate.gt(1)) || rates[0].gt(rates[1]) || rates[1].gt(rates[2])) throw new Error('INVALID_ASSET_SCENARIO_RATES')
    }
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
    if (scenario.householdId !== data.household.id || scenario.version !== 'scenario-v0.2') throw new Error('INVALID_SCENARIO')
    if (scenario.overrides.memberRetirement?.some((item) => !memberIds.has(item.memberId))) throw new Error('INVALID_SCENARIO_MEMBER')
    if (scenario.overrides.contributionOverrides?.some((item) => {
      const contribution = data.contributions.find((candidate) => candidate.id === item.contributionId)
      const startDate = item.startDate ?? contribution?.startDate
      return !contribution || (item.amountTwd !== undefined && (!new Decimal(item.amountTwd).isFinite() || new Decimal(item.amountTwd).lt(0))) || (item.endRule === 'fixedDate' && (!item.endDate || !startDate || item.endDate < startDate.slice(0, 7)))
    })) throw new Error('INVALID_SCENARIO_CONTRIBUTION')
    if (scenario.overrides.additionalContributions?.some((item) => !memberIds.has(item.sourceMemberId) || !new Decimal(item.amountTwd).isFinite() || new Decimal(item.amountTwd).lt(0) || Boolean(item.destinationAssetId) === Boolean(item.returnProfileId))) throw new Error('INVALID_SCENARIO_CONTRIBUTION')
    if (scenario.overrides.assetRates?.some((item) => {
      const rates = [item.scenarioRates.conservative, item.scenarioRates.balanced, item.scenarioRates.optimistic].map((rate) => new Decimal(rate))
      return !data.assets.some((asset) => asset.id === item.assetId) || rates.some((rate) => !rate.isFinite() || rate.lt('-0.99') || rate.gt(1)) || rates[0].gt(rates[1]) || rates[1].gt(rates[2])
    })) throw new Error('INVALID_SCENARIO_ASSET')
    if (scenario.overrides.retirementSystems?.some((item) => !memberIds.has(item.memberId) || (item.laborPensionVoluntaryRate !== undefined && (new Decimal(item.laborPensionVoluntaryRate).lt(0) || new Decimal(item.laborPensionVoluntaryRate).gt('.06'))))) throw new Error('INVALID_SCENARIO_PENSION_RATE')
    if (scenario.overrides.annualInflationRate !== undefined && (!new Decimal(scenario.overrides.annualInflationRate).isFinite() || new Decimal(scenario.overrides.annualInflationRate).lt('-0.99') || new Decimal(scenario.overrides.annualInflationRate).gt(1))) throw new Error('INVALID_SCENARIO_INFLATION')
    if (scenario.overrides.rebalance) calculateRebalancing({ allocations: [], targets: scenario.overrides.rebalance.targetWeights, driftThreshold: '0' })
  }
  for (const instrument of data.instruments) {
    if (!data.assets.some((asset) => asset.id === instrument.assetId) || !/^\d{4,6}[A-Z]?$/.test(instrument.symbol)) throw new Error('INVALID_MARKET_INSTRUMENT')
    if (data.instruments.some((item) => item.id !== instrument.id && item.assetId === instrument.assetId)) throw new Error('DUPLICATE_ASSET_INSTRUMENT')
  }
  for (const quote of data.marketQuotes) if (!data.instruments.some((item) => item.id === quote.instrumentId) || new Decimal(quote.price).lt(0)) throw new Error('INVALID_MARKET_QUOTE')
  for (const rate of data.exchangeRates) if (rate.toCurrency !== 'TWD' || !new Decimal(rate.rate).isFinite() || new Decimal(rate.rate).lte(0)) throw new Error('INVALID_EXCHANGE_RATE')
  for (const contribution of data.contributions) {
    validateMoney(contribution.amount)
    if (!memberIds.has(contribution.sourceMemberId)) throw new Error('INVALID_CONTRIBUTION_MEMBER')
    if (contribution.endRule === 'fixedDate' && (!contribution.endDate || contribution.endDate < (contribution.endDate.length === 10 ? contribution.startDate : contribution.startDate.slice(0, 7)))) throw new Error('INVALID_CONTRIBUTION_END_DATE')
    if (Boolean(contribution.destinationAssetId) === Boolean(contribution.returnProfileId)) throw new Error('INVALID_CONTRIBUTION_DESTINATION')
  }
}

export function toCalculationInputV01(data: PlannerData): CalculationInput {
  validatePlannerData(data)
  if (data.assets.some((item) => item.status === 'provided' && !moneyToTwd(data, item.currentValue)) || data.contributions.some((item) => item.status === 'provided' && !moneyToTwd(data, item.amount))) throw new Error('FX_RATE_REQUIRED')
  const stripHousehold = (item: PlannerData['household']): Household => ({ id: item.id, name: item.name, baseCurrency: item.baseCurrency, primaryMemberId: item.primaryMemberId })
  const stripMember = (item: PlannerData['members'][number]): Member => ({ id: item.id, householdId: item.householdId, name: item.name, role: item.role, birthDate: item.birthDate, planningEndAge: item.planningEndAge, plannedRetirementMonth: item.plannedRetirementMonth, isActive: item.isActive })
  const assets: Asset[] = data.assets.map((item) => ({ id: item.id, householdId: item.householdId, name: item.name, assetType: item.assetType === 'cash' || item.assetType === 'timeDeposit' ? 'cash' : item.assetType === 'stock' || item.assetType === 'etf' || item.assetType === 'stockEtf' ? 'stockEtf' : 'other', ownershipType: item.ownershipType, ownerMemberId: item.ownerMemberId, owners: item.owners, currentValueTwd: item.currentValue.currency === 'TWD' ? item.currentValue.amount : moneyToTwd(data, item.currentValue)?.toFixed(2) ?? '0', includeInTotalAssets: item.includeInTotalAssets, retirementUsageScope: item.retirementUsageScope, availableFrom: item.availableFrom, returnProfileId: item.returnProfileId, status: item.status }))
  const contributions: Contribution[] = data.contributions.map((item) => ({ id: item.id, householdId: item.householdId, sourceMemberId: item.sourceMemberId, amountTwd: item.amount.currency === 'TWD' ? item.amount.amount : moneyToTwd(data, item.amount)?.toFixed(2) ?? '0', usageScope: item.usageScope, startDate: item.startDate, endRule: item.endRule, endDate: item.endDate, destinationAssetId: item.destinationAssetId, returnProfileId: item.returnProfileId, status: item.status }))
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
      assets: data.assets.filter((asset) => selectedIds.has(asset.id)).map((asset) => ({ scenarioRates: asset.scenarioRates, id: asset.id, name: asset.name, currentValueTwd: moneyToTwd(data, asset.currentValue)?.toFixed(2) ?? '0', annualReturnRate: profiles.get(asset.returnProfileId ?? '') ?? '0', availableFrom: asset.availableFrom, status: moneyToTwd(data, asset.currentValue) ? asset.status : 'notProvided' })),
      contributions: data.contributions.filter((item) => !options.scope || (item.destinationAssetId && selectedIds.has(item.destinationAssetId))).map((item) => {
        const destinationRate = item.destinationAssetId ? profiles.get(data.assets.find((asset) => asset.id === item.destinationAssetId)?.returnProfileId ?? '') : profiles.get(item.returnProfileId ?? '')
        return { scenarioRates: item.destinationAssetId ? data.assets.find((asset) => asset.id === item.destinationAssetId)?.scenarioRates : undefined, id: item.id, amountTwd: moneyToTwd(data, item.amount)?.toFixed(2) ?? '0', annualReturnRate: destinationRate ?? '0', startMonth: item.startDate.slice(0, 7), endMonth: contributionEndMonth(data, item), status: moneyToTwd(data, item.amount) ? item.status : 'notProvided' }
      }),
      laborPensions: (options.scope ? [] : data.retirementSystems).map((record) => {
        const member = data.members.find((item) => item.id === record.memberId)
        const pension = record.laborPension
        return { id: record.id, memberName: member?.name ?? '未知成員', currentBalanceTwd: pension.currentAccountBalanceTwd, monthlyContributionTwd: new Decimal(pension.monthlyContributionSalaryTwd).mul(new Decimal(pension.employerContributionRate).plus(pension.voluntaryContributionRate)).toString(), annualReturnRate: pension.projectedAnnualReturnRate, claimMonth: member ? addMonths(member.birthDate, pension.claimAge * 12) : data.calculationBaseDate.slice(0, 7), status: record.status === 'provided' && pension.enabled ? 'provided' : record.status === 'notProvided' ? 'notProvided' : 'notApplicable' }
      }),
    }
    const result = await projectRetirement(input)
    for (const asset of data.assets.filter((item) => selectedIds.has(item.id) && item.status === 'provided' && !moneyToTwd(data, item.currentValue))) {
      result.warnings.push({ code: 'FX_RATE_REQUIRED', message: '資產「' + asset.name + '」缺少 ' + asset.currentValue.currency + '/TWD 匯率，尚未納入合計；請至行情更新或編輯資產填寫匯率。', entityId: asset.id })
    }
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
        { calculationBaseDate: data.calculationBaseDate, birthDate: member.birthDate, averageInsuredSalaryTwd: record.laborInsurance.averageInsuredSalaryTwd, insuredYears: record.laborInsurance.insuredYears, claimAge: record.laborInsurance.claimAge },
        { claimMode: record.laborPension.claimMode, birthDate: member.birthDate, calculationBaseDate: data.calculationBaseDate, currentAccountBalanceTwd: record.laborPension.currentAccountBalanceTwd, contributionYears: record.laborPension.contributionYears, monthlyContributionSalaryTwd: record.laborPension.monthlyContributionSalaryTwd, employerContributionRate: record.laborPension.employerContributionRate, voluntaryContributionRate: record.laborPension.voluntaryContributionRate, projectedAnnualReturnRate: record.laborPension.projectedAnnualReturnRate, annualInflationRate: data.assumptions.annualInflationRate, claimAge: record.laborPension.claimAge },
      )
      return { memberId: member.id, memberName: member.name, status: record.status, laborInsuranceEnabled: record.laborInsurance.enabled, laborPensionEnabled: record.laborPension.enabled, estimate }
    })
  }
  retirementEligibility(data: PlannerData, memberId: string, month: string) {
    const member = data.members.find((item) => item.id === memberId)
    const record = data.retirementSystems.find((item) => item.memberId === memberId)
    if (!member || !record || record.status !== 'provided') return null
    return retirementEligibilityAtMonth({ birthDate: member.birthDate, calculationBaseDate: data.calculationBaseDate, month, insuredYears: record.laborInsurance.insuredYears, insuranceClaimAge: record.laborInsurance.claimAge, contributionYears: record.laborPension.contributionYears, pensionClaimAge: record.laborPension.claimAge, pensionContributing: new Decimal(record.laborPension.monthlyContributionSalaryTwd).gt(0) })
  }
  laborRuleVersion() { return TAIWAN_LABOR_RULES_2026 }
  portfolio(data: PlannerData, portfolioId?: string): RebalancingResult | null {
    const portfolio = portfolioId ? data.portfolios.find((item) => item.id === portfolioId) : data.portfolios[0]
    if (!portfolio) return null
    const allocations = portfolio.assetIds.flatMap((id) => {
      const asset = data.assets.find((item) => item.id === id)
      if (!asset || asset.status !== 'provided') return []
      const value = moneyToTwd(data, asset.currentValue)
      return value ? [{ assetClass: asset.allocationClass ?? 'other', valueTwd: value.toFixed(2) }] : []
    })
    return calculateRebalancing({ allocations, targets: portfolio.targets, driftThreshold: portfolio.driftThreshold })
  }
  dashboard(data: PlannerData, scope: DashboardScope): DashboardViewModel {
    const member = data.members.find((item) => item.role === scope)
    const scopedValue = (money: MoneyAmount, item: OwnershipFields) => {
      const converted = moneyToTwd(data, money)
      if (!converted) return null
      if (scope === 'household') return converted
      if (!member || item.ownershipType === 'household') return null
      if (item.ownershipType === 'individual') return item.ownerMemberId === member.id ? converted : null
      const share = item.owners?.find((owner) => owner.memberId === member.id)?.share
      return share ? converted.mul(share) : null
    }
    const assets = data.assets.flatMap((asset) => asset.includeInTotalAssets && asset.status === 'provided' ? [scopedValue(asset.currentValue, asset)].filter((value): value is Decimal => value !== null) : [])
    const liabilities = data.liabilities.flatMap((item) => item.status === 'provided' ? [scopedValue(item.currentBalance, item)].filter((value): value is Decimal => value !== null) : [])
    const totalAssets = assets.reduce((sum, value) => sum.plus(value), new Decimal(0))
    const totalLiabilities = liabilities.reduce((sum, value) => sum.plus(value), new Decimal(0))
    const missingDataCount = [...data.assets, ...data.incomes, ...data.expenses, ...data.liabilities].filter((item) => item.status === 'notProvided').length
    return { scope, totalAssetsTwd: totalAssets.toFixed(2), totalLiabilitiesTwd: totalLiabilities.toFixed(2), netWorthTwd: totalAssets.minus(totalLiabilities).toFixed(2), assetCount: assets.length, liabilityCount: liabilities.length, missingDataCount, retirementResultScopeLabel: '主要規劃人的家庭退休計畫' }
  }
  financialOverview(data: PlannerData): FinancialOverview {
    const total = (items: Array<{ status: PlannerData['assets'][number]['status']; monthlyAmount?: MoneyAmount; monthlyPayment?: MoneyAmount }>, field: 'monthlyAmount' | 'monthlyPayment') => {
      const provided = items.filter((item) => item.status === 'provided')
      if (provided.length !== items.length) return undefined
      if (provided.some((item) => item[field] && !moneyToTwd(data, item[field]!))) return undefined
      return provided.reduce((sum, item) => sum.plus(item[field] ? moneyToTwd(data, item[field]!)! : 0), new Decimal(0)).toFixed(2)
    }
    const income = total(data.incomes, 'monthlyAmount')
    const expense = total(data.expenses, 'monthlyAmount')
    const debt = total(data.liabilities, 'monthlyPayment')
    const baseMonth = data.calculationBaseDate.slice(0, 7)
    const activeContributions = data.contributions.filter((item) => contributionActiveInMonth(data, item, baseMonth))
    const contributionTwd = data.contributions.length === 0 || data.contributions.some((item) => item.status === 'notProvided') || activeContributions.some((item) => !moneyToTwd(data, item.amount)) ? undefined : activeContributions.reduce((sum, item) => sum.plus(moneyToTwd(data, item.amount)!), new Decimal(0)).toFixed(2)
    const unallocatedTwd = income !== undefined && expense !== undefined && debt !== undefined && contributionTwd !== undefined ? new Decimal(income).minus(expense).minus(debt).minus(contributionTwd).toFixed(2) : undefined
    const dashboard = this.dashboard(data, 'household')
    return {
      missingFxCurrencies: [...new Set(data.assets.filter((asset) => asset.status === 'provided' && !moneyToTwd(data, asset.currentValue)).map((asset) => asset.currentValue.currency))],
      household: { monthlyIncomeTwd: income, monthlyExpenseTwd: expense, monthlyDebtPaymentTwd: debt, monthlyContributionTwd: contributionTwd, unallocatedTwd },
      assets: { totalTwd: dashboard.totalAssetsTwd, liabilitiesTwd: dashboard.totalLiabilitiesTwd, netWorthTwd: dashboard.netWorthTwd },
      accountCount: data.accounts.length,
      holdingCount: data.holdings.length,
      completeness: { hasIncome: data.incomes.some((item) => item.status === 'provided'), hasExpense: data.expenses.some((item) => item.status === 'provided'), hasLiability: data.liabilities.some((item) => item.status === 'provided'), hasContribution: data.contributions.some((item) => item.status === 'provided') },
      accounts: data.accounts.map((account) => {
        const assets = data.assets.filter((asset) => asset.accountId === account.id)
        const available = account.status === 'provided' && assets.every((asset) => asset.status === 'provided' && moneyToTwd(data, asset.currentValue) !== null)
        return { id: account.id, name: account.name, institution: account.institution, accountType: account.accountType, assetCount: assets.length, totalTwd: available ? assets.reduce((sum, asset) => sum.plus(moneyToTwd(data, asset.currentValue)!), new Decimal(0)).toFixed(2) : undefined, status: available ? 'provided' : 'notProvided' }
      }),
    }
  }
}
