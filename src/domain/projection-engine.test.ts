import { describe, expect, it } from 'vitest'
import { createDemoData } from '../application/planner-data'
import { toCalculationInputV01 } from '../application/planner-service'
import type { ProjectionInput } from './models'
import { projectRetirement } from './projection-engine'

function fixture(): ProjectionInput {
  const data = createDemoData('2026-09-01')
  data.members[0].plannedRetirementMonth = '2050-09'
  return {
    contractVersion: 'projection-contract-v0.1', baseCalculationInput: toCalculationInputV01(data), plannedRetirementMonth: '2050-09',
    incomes: [{ id: 'salary', monthlyAmountTwd: '100000', annualGrowthRate: '0', startMonth: '2026-09', endMonth: '2050-09', status: 'provided' }],
    expenses: [{ id: 'living', monthlyAmountTwd: '50000', annualGrowthRate: '0', startMonth: '2026-09', status: 'provided' }],
    liabilities: [{ id: 'loan', balanceTwd: '120000', monthlyPaymentTwd: '10000', status: 'provided' }],
  }
}

describe('完整家庭 Projection', () => {
  it('產生預計退休資產、目標、準備率與 50/55/60/65 歲節點', async () => {
    const result = await projectRetirement(fixture())
    expect(result.contractVersion).toBe('projection-contract-v0.1')
    expect(Number(result.projectedAssetsAtPlannedReal)).toBeGreaterThan(0)
    expect(Number(result.retirementTargetAssetsReal)).toBeGreaterThan(0)
    expect(result.milestones.map((item) => item.age)).toEqual([50, 55, 60, 65])
  })

  it('收入不會自動重複計入資產，但會進入現金流可用額', async () => {
    const withIncome = fixture()
    const withoutIncome = fixture()
    withoutIncome.incomes[0].monthlyAmountTwd = '0'
    const [first, second] = await Promise.all([projectRetirement(withIncome), projectRetirement(withoutIncome)])
    expect(first.projectedAssetsAtPlannedNominal).toBe(second.projectedAssetsAtPlannedNominal)
    expect(Number(first.timeline[0].unallocatedCashFlow)).toBeGreaterThan(Number(second.timeline[0].unallocatedCashFlow))
  })

  it('notProvided 會提醒，provided 0 與 notApplicable 不會被當成缺漏', async () => {
    const input = fixture()
    input.incomes = [
      { ...input.incomes[0], id: 'missing', status: 'notProvided' },
      { ...input.incomes[0], id: 'zero', monthlyAmountTwd: '0', status: 'provided' },
      { ...input.incomes[0], id: 'na', status: 'notApplicable' },
    ]
    const result = await projectRetirement(input)
    expect(result.warnings.filter((item) => item.code === 'INCOME_NOT_PROVIDED').map((item) => item.entityId)).toEqual(['missing'])
  })
})
