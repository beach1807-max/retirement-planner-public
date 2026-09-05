import Decimal from 'decimal.js'
import { addMonths, monthIndex, monthsBetween, toMonth } from './date'

export const TAIWAN_LABOR_RULES_2026 = {
  version: 'tw-labor-rules-2026-08-20',
  effectiveDate: '2026-08-20',
  checkedAt: '2026-09-02',
  laborPensionAnnuityRate: '0.011473',
  employerMinimumRate: '0.06',
  voluntaryMaximumRate: '0.06',
  sources: [
    'https://www.bli.gov.tw/0004857.html',
    'https://www.bli.gov.tw/0017389.html',
    'https://www.bli.gov.tw/0018437.html',
    'https://www.bli.gov.tw/0008222.html',
  ],
} as const

const LIFE_EXPECTANCY_YEARS: Record<number, number> = { 60: 23, 61: 23, 62: 22, 63: 21, 64: 20, 65: 19, 66: 19, 67: 18, 68: 17, 69: 16, 70: 16, 71: 15, 72: 14, 73: 13, 74: 13, 75: 12, 76: 11, 77: 11, 78: 10, 79: 9, 80: 9, 81: 8, 82: 8, 83: 7, 84: 6, 85: 6 }

export interface LaborInsuranceInput { birthDate: string; averageInsuredSalaryTwd: string; insuredYears: string; claimAge: number }
export interface LaborPensionInput { claimMode?: 'lumpSum' | 'monthly'; birthDate: string; calculationBaseDate: string; currentAccountBalanceTwd: string; contributionYears: string; monthlyContributionSalaryTwd: string; employerContributionRate: string; voluntaryContributionRate: string; projectedAnnualReturnRate: string; annualInflationRate: string; claimAge: number }
export interface RetirementSystemEstimate { ruleVersion: string; laborInsurance: { status: 'success' | 'ineligible' | 'error'; claimMonth: string; statutoryClaimAge: number; formulaA: string | null; formulaB: string | null; adjustmentRate: string | null; monthlyBenefitRealTwd: string | null }; laborPension: { monthlyBenefitNominalTwd?: string | null; status: 'monthly' | 'lumpSum' | 'lumpSumOnly' | 'error'; claimMonth: string; projectedAccountBalanceTwd: string | null; monthlyBenefitRealTwd: string | null; lumpSumBenefitTwd: string | null; lifeExpectancyYears: number | null }; errors: string[] }

export function statutoryLaborInsuranceAge(birthDate: string): number {
  const year = Number(birthDate.slice(0, 4))
  if (year <= 1957) return 60
  if (year === 1958) return 61
  if (year === 1959) return 62
  if (year === 1960) return 63
  if (year === 1961) return 64
  return 65
}

export function estimateLaborInsurance(input: LaborInsuranceInput) {
  const statutoryAge = statutoryLaborInsuranceAge(input.birthDate)
  const claimMonth = addMonths(input.birthDate, input.claimAge * 12)
  const salary = new Decimal(input.averageInsuredSalaryTwd)
  const years = new Decimal(input.insuredYears)
  if (salary.lt(0) || years.lt(0) || input.claimAge < statutoryAge - 5) return { status: 'error' as const, claimMonth, statutoryClaimAge: statutoryAge, formulaA: null, formulaB: null, adjustmentRate: null, monthlyBenefitRealTwd: null }
  if (years.lt(15)) return { status: 'ineligible' as const, claimMonth, statutoryClaimAge: statutoryAge, formulaA: null, formulaB: null, adjustmentRate: null, monthlyBenefitRealTwd: null }
  const formulaA = salary.mul(years).mul('0.00775').plus(3000)
  const formulaB = salary.mul(years).mul('0.0155')
  const monthDifference = (input.claimAge - statutoryAge) * 12
  const adjustment = Decimal.max('-0.2', Decimal.min('0.2', new Decimal(monthDifference).div(12).mul('0.04')))
  const benefit = Decimal.max(formulaA, formulaB).mul(new Decimal(1).plus(adjustment)).toDecimalPlaces(0)
  return { status: 'success' as const, claimMonth, statutoryClaimAge: statutoryAge, formulaA: formulaA.toDecimalPlaces(0).toString(), formulaB: formulaB.toDecimalPlaces(0).toString(), adjustmentRate: adjustment.toString(), monthlyBenefitRealTwd: benefit.toString() }
}

export function estimateLaborPension(input: LaborPensionInput) {
  const claimMonth = addMonths(input.birthDate, input.claimAge * 12)
  const voluntaryRate = new Decimal(input.voluntaryContributionRate)
  const employerRate = new Decimal(input.employerContributionRate)
  const annualReturn = new Decimal(input.projectedAnnualReturnRate)
  if (input.claimAge < 60 || voluntaryRate.lt(0) || voluntaryRate.gt(TAIWAN_LABOR_RULES_2026.voluntaryMaximumRate) || employerRate.lt(TAIWAN_LABOR_RULES_2026.employerMinimumRate) || annualReturn.lte(-1)) return { status: 'error' as const, claimMonth, projectedAccountBalanceTwd: null, monthlyBenefitRealTwd: null, lumpSumBenefitTwd: null, lifeExpectancyYears: null }
  const months = Math.max(0, monthsBetween(toMonth(input.calculationBaseDate), claimMonth))
  const monthlyRate = new Decimal(1).plus(annualReturn).pow(new Decimal(1).div(12)).minus(1)
  const contribution = new Decimal(input.monthlyContributionSalaryTwd).mul(employerRate.plus(voluntaryRate))
  let balance = new Decimal(input.currentAccountBalanceTwd)
  for (let index = 0; index < months; index += 1) balance = balance.mul(new Decimal(1).plus(monthlyRate)).plus(contribution)
  const projectedYears = new Decimal(input.contributionYears).plus(contribution.gt(0) ? new Decimal(months).div(12) : 0)
  const roundedBalance = balance.toDecimalPlaces(0)
  if (input.claimMode === 'lumpSum') return { status: 'lumpSum' as const, claimMonth, projectedAccountBalanceTwd: roundedBalance.toString(), monthlyBenefitRealTwd: null, lumpSumBenefitTwd: roundedBalance.toString(), lifeExpectancyYears: null }
  if (projectedYears.lt(15)) return { status: 'lumpSumOnly' as const, claimMonth, projectedAccountBalanceTwd: roundedBalance.toString(), monthlyBenefitRealTwd: null, lumpSumBenefitTwd: roundedBalance.toString(), lifeExpectancyYears: null }
  const lifeExpectancy = LIFE_EXPECTANCY_YEARS[Math.min(85, Math.floor(input.claimAge))]
  if (!lifeExpectancy) return { status: 'error' as const, claimMonth, projectedAccountBalanceTwd: null, monthlyBenefitRealTwd: null, lumpSumBenefitTwd: null, lifeExpectancyYears: null }
  const interest = new Decimal(TAIWAN_LABOR_RULES_2026.laborPensionAnnuityRate)
  const monthlyInterest = new Decimal(1).plus(interest).pow(new Decimal(1).div(12)).minus(1)
  const factorYears = new Decimal(1).minus(new Decimal(1).div(new Decimal(1).plus(interest)).pow(lifeExpectancy)).div(new Decimal(12).mul(monthlyInterest)).mul(new Decimal(1).plus(monthlyInterest))
  const monthly = roundedBalance.div(factorYears).div(12).toDecimalPlaces(0)
  const inflationFactor = new Decimal(1).plus(input.annualInflationRate).pow(new Decimal(months).div(12))
  return { status: 'monthly' as const, monthlyBenefitNominalTwd: monthly.toString(), claimMonth, projectedAccountBalanceTwd: roundedBalance.toString(), monthlyBenefitRealTwd: monthly.div(inflationFactor).toDecimalPlaces(0).toString(), lumpSumBenefitTwd: roundedBalance.toString(), lifeExpectancyYears: lifeExpectancy }
}

export function estimateRetirementSystem(laborInsurance: LaborInsuranceInput, laborPension: LaborPensionInput): RetirementSystemEstimate {
  const insurance = estimateLaborInsurance(laborInsurance)
  const pension = estimateLaborPension(laborPension)
  const errors: string[] = []
  if (insurance.status === 'error') errors.push('勞保資料或請領年齡不符合規則。')
  if (insurance.status === 'ineligible') errors.push('勞保年資未滿 15 年，老年年金不適用；請另洽勞保局確認一次給付。')
  if (pension.status === 'error') errors.push('勞退資料、提繳率或請領年齡不符合規則。')
  return { ruleVersion: TAIWAN_LABOR_RULES_2026.version, laborInsurance: insurance, laborPension: pension, errors }
}

export function claimAgeAtMonth(birthDate: string, month: string): number { return Math.floor((monthIndex(month) - monthIndex(birthDate)) / 12) }
