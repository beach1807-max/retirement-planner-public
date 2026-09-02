import Decimal from 'decimal.js'
import { calculateRetirement } from './calculation-engine'
import { addMonths, monthIndex, monthsBetween, toMonth } from './date'
import type { CalculationInput, CalculationMessage, ProjectionCashFlow, ProjectionInput, ProjectionResult } from './models'

const ZERO = new Decimal(0)
const money = (value: Decimal) => value.toDecimalPlaces(2).toFixed(2)

function monthlyFlow(item: ProjectionCashFlow, month: string): Decimal {
  if (item.status !== 'provided' || month < item.startMonth || (item.endMonth && month >= item.endMonth)) return ZERO
  const years = new Decimal(Math.max(0, monthsBetween(item.startMonth, month))).div(12)
  return new Decimal(item.monthlyAmountTwd).mul(new Decimal(1).plus(item.annualGrowthRate).pow(years))
}

function fixedInput(input: CalculationInput, plannedMonth: string, assets = input.assets, contributions = input.contributions): CalculationInput {
  return { ...input, calculationId: `${input.calculationId}-fixed-${plannedMonth}`, assets, contributions, retirementPlan: { ...input.retirementPlan, earliestRetirementMonth: plannedMonth } }
}

function targetAssets(input: ProjectionInput): Decimal | null {
  const base = input.baseCalculationInput
  const primary = base.members.find((member) => member.id === base.household.primaryMemberId)
  const profile = base.assumptions.returnProfiles.find((item) => item.id === base.retirementPlan.defaultReturnProfileId)
  if (!primary || !profile || new Decimal(profile.annualReturnRate).lte(-1) || new Decimal(base.assumptions.annualInflationRate).lte(-1)) return null
  const baseMonth = toMonth(base.calculationBaseDate)
  const plannedMonth = toMonth(input.plannedRetirementMonth)
  const planEndMonth = addMonths(primary.birthDate, primary.planningEndAge * 12)
  const monthlyReturn = new Decimal(1).plus(profile.annualReturnRate).pow(new Decimal(1).div(12)).minus(1)
  const oneTime = new Map(base.retirementPlan.oneTimeExpenses.map((item) => [toMonth(item.month), new Decimal(item.amountTwdReal)]))
  const inflation = (month: string) => new Decimal(1).plus(base.assumptions.annualInflationRate).pow(new Decimal(Math.max(0, monthsBetween(baseMonth, month))).div(12))
  let required = new Decimal(base.retirementPlan.safetyReserveRealTwd).plus(base.retirementPlan.legacyTargetRealTwd).mul(inflation(planEndMonth))
  for (let cursor = monthIndex(planEndMonth); cursor >= monthIndex(plannedMonth); cursor -= 1) {
    const month = addMonths(plannedMonth, cursor - monthIndex(plannedMonth))
    const benefitsReal = input.retirementBenefits.reduce((sum, flow) => sum.plus(monthlyFlow(flow, month)), ZERO)
    const withdrawalReal = Decimal.max(ZERO, new Decimal(base.retirementPlan.retirementExpenseMonthlyRealTwd).plus(oneTime.get(month) ?? ZERO).minus(benefitsReal))
    required = required.div(new Decimal(1).plus(monthlyReturn)).plus(withdrawalReal.mul(inflation(month)))
  }
  return required.div(inflation(plannedMonth)).toDecimalPlaces(2)
}

export async function projectRetirement(input: ProjectionInput): Promise<ProjectionResult> {
  const base = input.baseCalculationInput
  const primary = base.members.find((member) => member.id === base.household.primaryMemberId)
  if (!primary) throw new Error('PRIMARY_MEMBER_MISSING')
  const plannedMonth = toMonth(input.plannedRetirementMonth)
  const forwardInput = fixedInput(base, plannedMonth)
  forwardInput.retirementPlan = { ...forwardInput.retirementPlan, retirementExpenseMonthlyRealTwd: '0', safetyReserveRealTwd: '0', legacyTargetRealTwd: '0' }
  const [forward, fixed] = await Promise.all([
    calculateRetirement(forwardInput),
    calculateRetirement(fixedInput(base, plannedMonth)),
  ])
  const target = targetAssets(input)
  const plannedItem = forward.monthlyTimeline.find((item) => item.month === plannedMonth)
  const projectedNominal = plannedItem ? new Decimal(plannedItem.closingAssets) : null
  const projectedReal = plannedItem ? new Decimal(plannedItem.closingAssetsReal) : null
  const readiness = target && target.gt(0) && projectedReal ? projectedReal.div(target).mul(100) : target?.eq(0) ? null : null
  const warnings: CalculationMessage[] = [
    ...input.incomes.filter((item) => item.status === 'notProvided').map((item) => ({ code: 'INCOME_NOT_PROVIDED', message: `收入「${item.label ?? item.id}」尚未提供。`, entityId: item.id })),
    ...input.expenses.filter((item) => item.status === 'notProvided').map((item) => ({ code: 'EXPENSE_NOT_PROVIDED', message: `支出「${item.label ?? item.id}」尚未提供。`, entityId: item.id })),
    ...input.liabilities.filter((item) => item.status === 'notProvided').map((item) => ({ code: 'LIABILITY_NOT_PROVIDED', message: `負債「${item.label ?? item.id}」尚未提供。`, entityId: item.id })),
  ]
  const timeline = forward.monthlyTimeline.map((item) => {
    const income = input.incomes.reduce((sum, flow) => sum.plus(monthlyFlow(flow, item.month)), ZERO)
    const expenses = input.expenses.reduce((sum, flow) => sum.plus(monthlyFlow(flow, item.month)), ZERO)
    let remainingPayments = ZERO
    let liabilityBalance = ZERO
    for (const liability of input.liabilities) {
      if (liability.status !== 'provided') continue
      const elapsed = Math.max(0, monthsBetween(base.calculationBaseDate, item.month))
      const balance = Decimal.max(ZERO, new Decimal(liability.balanceTwd).minus(new Decimal(liability.monthlyPaymentTwd).mul(elapsed)))
      liabilityBalance = liabilityBalance.plus(balance)
      remainingPayments = remainingPayments.plus(Decimal.min(balance, new Decimal(liability.monthlyPaymentTwd)))
    }
    const contributions = new Decimal(item.contributions)
    const retirementIncomeReal = input.retirementBenefits.reduce((sum, flow) => sum.plus(monthlyFlow(flow, item.month)), ZERO)
    const unallocated = income.minus(expenses).minus(remainingPayments).minus(contributions)
    if (unallocated.lt(0) && !warnings.some((warning) => warning.code === 'NEGATIVE_PRE_RETIREMENT_CASH_FLOW')) warnings.push({ code: 'NEGATIVE_PRE_RETIREMENT_CASH_FLOW', message: '明確投入高於收入扣除一般支出與負債還款後的餘額；系統未重複扣除投入。' })
    return { month: item.month, income: money(income), generalExpenses: money(expenses), liabilityPayments: money(remainingPayments), retirementIncomeReal: money(retirementIncomeReal), explicitContributions: money(contributions), unallocatedCashFlow: money(unallocated), liabilityBalance: money(liabilityBalance) }
  })
  const milestones = [50, 55, 60, 65].map((age) => {
    const month = addMonths(primary.birthDate, age * 12)
    const item = fixed.monthlyTimeline.find((entry) => entry.month === month)
    return { age, month, assetsNominal: item?.closingAssets ?? null, assetsReal: item?.closingAssetsReal ?? null }
  })
  return {
    contractVersion: 'projection-contract-v0.1', plannedRetirementMonth: plannedMonth,
    projectedAssetsAtPlannedNominal: projectedNominal ? money(projectedNominal) : null,
    projectedAssetsAtPlannedReal: projectedReal ? money(projectedReal) : null,
    retirementTargetAssetsReal: target === null ? null : money(target),
    readinessRate: readiness ? readiness.toDecimalPlaces(1).toString() : null,
    readinessStatus: target?.eq(0) || (readiness?.gte(100) ?? false) ? 'achieved' : target && projectedReal ? 'notAchieved' : 'unavailable',
    fixedRetirementStatus: target && projectedReal && projectedReal.gte(target) ? 'success' : 'notAchievableWithinHorizon', timeline, milestones, warnings,
  }
}
