import Decimal from 'decimal.js'
import { addMonths, monthIndex, toMonth } from './date'

export type LiabilityRepaymentType = 'levelPayment' | 'equalPrincipal' | 'fixedPayment' | 'interestOnly' | 'balloon' | 'manual'

export interface LiabilityProjectionInput {
  id: string
  name: string
  balanceAsOfMonth: string
  currentBalance: string
  annualInterestRate?: string
  repaymentType?: LiabilityRepaymentType
  remainingTermMonths?: number
  fixedMonthlyPayment?: string
  gracePeriodMonths?: number
  rateChanges?: Array<{ fromMonth: string; annualInterestRate: string }>
  extraPayments?: Array<{ month: string; amount: string }>
}

export interface LiabilityMonthlyItem {
  month: string
  openingPrincipal: string
  payment: string
  principalPaid: string
  interestPaid: string
  extraPrincipalPaid: string
  closingPrincipal: string
}

export interface LiabilityProjectionResult {
  id: string
  name: string
  status: 'calculated' | 'manual' | 'unpayable'
  payoffMonth?: string
  totalInterest: string
  schedule: LiabilityMonthlyItem[]
}

const ZERO = new Decimal(0)
const money = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)

function rateForMonth(input: LiabilityProjectionInput, month: string): Decimal {
  const changes = [...(input.rateChanges ?? [])].filter((item) => monthIndex(item.fromMonth) <= monthIndex(month)).sort((a, b) => monthIndex(a.fromMonth) - monthIndex(b.fromMonth))
  return new Decimal(changes.at(-1)?.annualInterestRate ?? input.annualInterestRate ?? '0').div(12)
}

function levelPayment(balance: Decimal, monthlyRate: Decimal, months: number): Decimal {
  if (monthlyRate.eq(0)) return balance.div(months)
  const factor = monthlyRate.plus(1).pow(months)
  return balance.mul(monthlyRate).mul(factor).div(factor.minus(1))
}

export function projectLiability(input: LiabilityProjectionInput): LiabilityProjectionResult {
  const repaymentType = input.repaymentType ?? 'manual'
  const opening = new Decimal(input.currentBalance)
  if (repaymentType === 'manual' || opening.eq(0)) return { id: input.id, name: input.name, status: repaymentType === 'manual' ? 'manual' : 'calculated', payoffMonth: opening.eq(0) ? toMonth(input.balanceAsOfMonth) : undefined, totalInterest: '0.00', schedule: [] }
  const term = input.remainingTermMonths
  if (!Number.isInteger(term) || !term || term < 1) return { id: input.id, name: input.name, status: 'unpayable', totalInterest: '0.00', schedule: [] }
  const grace = input.gracePeriodMonths ?? 0
  if (!Number.isInteger(grace) || grace < 0 || grace >= term) return { id: input.id, name: input.name, status: 'unpayable', totalInterest: '0.00', schedule: [] }

  let balance = opening
  let totalInterest = ZERO
  const schedule: LiabilityMonthlyItem[] = []
  const extraPayments = new Map((input.extraPayments ?? []).map((item) => [toMonth(item.month), new Decimal(item.amount)]))
  const amortizingMonths = term - grace
  const initialRate = rateForMonth(input, addMonths(input.balanceAsOfMonth, grace + 1))
  const originalLevelPayment = repaymentType === 'levelPayment' ? levelPayment(opening, initialRate, amortizingMonths) : ZERO
  const equalPrincipalAmount = repaymentType === 'equalPrincipal' ? opening.div(amortizingMonths) : ZERO

  for (let index = 1; index <= term && balance.gt(0); index += 1) {
    const month = addMonths(input.balanceAsOfMonth, index)
    const interest = balance.mul(rateForMonth(input, month))
    const inGrace = index <= grace
    let scheduledPayment = ZERO
    let principalPaid = ZERO

    if (inGrace) scheduledPayment = interest
    else if (repaymentType === 'levelPayment') {
      scheduledPayment = input.rateChanges?.length ? levelPayment(balance, rateForMonth(input, month), term - index + 1) : originalLevelPayment
      principalPaid = Decimal.max(ZERO, scheduledPayment.minus(interest))
    } else if (repaymentType === 'equalPrincipal') {
      principalPaid = Decimal.min(balance, equalPrincipalAmount)
      scheduledPayment = principalPaid.plus(interest)
    } else if (repaymentType === 'fixedPayment') {
      scheduledPayment = new Decimal(input.fixedMonthlyPayment ?? '0')
      if (scheduledPayment.lte(interest)) return { id: input.id, name: input.name, status: 'unpayable', totalInterest: money(totalInterest), schedule }
      principalPaid = Decimal.min(balance, scheduledPayment.minus(interest))
      scheduledPayment = principalPaid.plus(interest)
    } else if (repaymentType === 'interestOnly' || repaymentType === 'balloon') {
      principalPaid = index === term ? balance : ZERO
      scheduledPayment = interest.plus(principalPaid)
    }

    const requestedExtra = extraPayments.get(month) ?? ZERO
    const extraPrincipal = Decimal.min(Decimal.max(ZERO, balance.minus(principalPaid)), requestedExtra)
    balance = Decimal.max(ZERO, balance.minus(principalPaid).minus(extraPrincipal))
    totalInterest = totalInterest.plus(interest)
    schedule.push({ month, openingPrincipal: money(balance.plus(principalPaid).plus(extraPrincipal)), payment: money(scheduledPayment.plus(extraPrincipal)), principalPaid: money(principalPaid), interestPaid: money(interest), extraPrincipalPaid: money(extraPrincipal), closingPrincipal: money(balance) })
  }

  return { id: input.id, name: input.name, status: balance.eq(0) ? 'calculated' : 'unpayable', payoffMonth: balance.eq(0) ? schedule.at(-1)?.month : undefined, totalInterest: money(totalInterest), schedule }
}

export function liabilityBalanceAt(result: LiabilityProjectionResult, month: string, currentBalance: string): string {
  const item = result.schedule.filter((entry) => monthIndex(entry.month) <= monthIndex(month)).at(-1)
  return item?.closingPrincipal ?? currentBalance
}
