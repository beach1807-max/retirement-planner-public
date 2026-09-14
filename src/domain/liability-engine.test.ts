import { describe, expect, it } from 'vitest'
import { projectLiability } from './liability-engine'

describe('負債清償引擎', () => {
  it('本息平均攤還會分開本金與利息並在期末清償', () => {
    const result = projectLiability({ id: 'mortgage', name: '房貸', balanceAsOfMonth: '2026-09', currentBalance: '1000000', annualInterestRate: '0.024', repaymentType: 'levelPayment', remainingTermMonths: 120 })
    expect(result.status).toBe('calculated')
    expect(result.payoffMonth).toBe('2036-09')
    expect(result.schedule).toHaveLength(120)
    expect(Number(result.schedule[0].interestPaid)).toBeGreaterThan(0)
    expect(Number(result.schedule[0].principalPaid) + Number(result.schedule[0].interestPaid)).toBeCloseTo(Number(result.schedule[0].payment), 2)
    expect(result.schedule.at(-1)?.closingPrincipal).toBe('0.00')
  })

  it('本金平均攤還的利息與付款逐月下降', () => {
    const result = projectLiability({ id: 'loan', name: '信貸', balanceAsOfMonth: '2026-09', currentBalance: '120000', annualInterestRate: '0.12', repaymentType: 'equalPrincipal', remainingTermMonths: 12 })
    expect(Number(result.schedule[0].payment)).toBeGreaterThan(Number(result.schedule[1].payment))
    expect(result.payoffMonth).toBe('2027-09')
  })

  it('無息固定月付款可正確算出清償月份', () => {
    const result = projectLiability({ id: 'family', name: '親友借款', balanceAsOfMonth: '2026-09', currentBalance: '300000', annualInterestRate: '0', repaymentType: 'fixedPayment', remainingTermMonths: 60, fixedMonthlyPayment: '10000' })
    expect(result.payoffMonth).toBe('2029-03')
    expect(result.schedule).toHaveLength(30)
    expect(result.totalInterest).toBe('0.00')
  })

  it('提前還款只減少本金並提早清償', () => {
    const result = projectLiability({ id: 'car', name: '車貸', balanceAsOfMonth: '2026-09', currentBalance: '120000', annualInterestRate: '0', repaymentType: 'fixedPayment', remainingTermMonths: 24, fixedMonthlyPayment: '10000', extraPayments: [{ month: '2027-03', amount: '60000' }] })
    expect(result.payoffMonth).toBe('2027-03')
    expect(result.schedule.at(-1)?.extraPrincipalPaid).toBe('60000.00')
  })

  it('舊資料的手動管理模式不臆測清償日期', () => {
    const result = projectLiability({ id: 'legacy', name: '舊貸款', balanceAsOfMonth: '2026-09', currentBalance: '100000', fixedMonthlyPayment: '5000' })
    expect(result.status).toBe('manual')
    expect(result.payoffMonth).toBeUndefined()
    expect(result.schedule).toEqual([])
  })
})
