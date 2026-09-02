import { describe, expect, it } from 'vitest'
import { estimateLaborInsurance, estimateLaborPension, statutoryLaborInsuranceAge, TAIWAN_LABOR_RULES_2026 } from './retirement-system'

describe('臺灣勞保／勞退規則', () => {
  it('依出生年套用勞保法定請領年齡', () => {
    expect(statutoryLaborInsuranceAge('1957-01-01')).toBe(60)
    expect(statutoryLaborInsuranceAge('1960-01-01')).toBe(63)
    expect(statutoryLaborInsuranceAge('1962-01-01')).toBe(65)
  })

  it('重現勞保局 45,800 元、28 年的官方公式範例', () => {
    const full = estimateLaborInsurance({ birthDate: '1962-01-01', averageInsuredSalaryTwd: '45800', insuredYears: '28', claimAge: 65 })
    expect(full.formulaB).toBe('19877')
    expect(full.monthlyBenefitRealTwd).toBe('19877')
    const early = estimateLaborInsurance({ birthDate: '1962-01-01', averageInsuredSalaryTwd: '45800', insuredYears: '28', claimAge: 60 })
    expect(early.adjustmentRate).toBe('-0.2')
    expect(early.monthlyBenefitRealTwd).toBe('15902')
  })

  it('勞保年資不足不猜年金，過早請領回傳錯誤', () => {
    expect(estimateLaborInsurance({ birthDate: '1980-01-01', averageInsuredSalaryTwd: '40000', insuredYears: '14', claimAge: 65 }).status).toBe('ineligible')
    expect(estimateLaborInsurance({ birthDate: '1980-01-01', averageInsuredSalaryTwd: '40000', insuredYears: '20', claimAge: 59 }).status).toBe('error')
  })

  it('勞退滿 60 歲且預估年資滿 15 年可月領，未滿則只顯示一次金', () => {
    const base = { birthDate: '1966-09-01', calculationBaseDate: '2026-09-01', currentAccountBalanceTwd: '1000000', contributionYears: '15', monthlyContributionSalaryTwd: '45800', employerContributionRate: '0.06', voluntaryContributionRate: '0', projectedAnnualReturnRate: '0', annualInflationRate: '0', claimAge: 60 }
    const monthly = estimateLaborPension(base)
    expect(monthly.status).toBe('monthly')
    expect(monthly.lifeExpectancyYears).toBe(23)
    expect(Number(monthly.monthlyBenefitRealTwd)).toBeGreaterThan(0)
    const lumpSum = estimateLaborPension({ ...base, calculationBaseDate: '2026-09-01', birthDate: '1966-10-01', contributionYears: '14.8' })
    expect(lumpSum.status).toBe('lumpSumOnly')
  })

  it('勞退自提超過 6% 或雇主低於 6% 會拒絕估算', () => {
    const base = { birthDate: '1980-01-01', calculationBaseDate: '2026-09-01', currentAccountBalanceTwd: '0', contributionYears: '10', monthlyContributionSalaryTwd: '40000', employerContributionRate: TAIWAN_LABOR_RULES_2026.employerMinimumRate, voluntaryContributionRate: '0.061', projectedAnnualReturnRate: '0.02', annualInflationRate: '0.02', claimAge: 60 }
    expect(estimateLaborPension(base).status).toBe('error')
    expect(estimateLaborPension({ ...base, voluntaryContributionRate: '0', employerContributionRate: '0.059' }).status).toBe('error')
  })
})
