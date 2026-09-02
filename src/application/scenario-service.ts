import Decimal from 'decimal.js'
import { sha256 } from '../domain/canonical'
import type { CalculationResult, ProjectionResult } from '../domain/models'
import type { PlannerData, PlannerScenario } from './planner-data'

interface Engines {
  calculate(data: PlannerData): Promise<CalculationResult>
  project(data: PlannerData): Promise<ProjectionResult>
  retirementSystems(data: PlannerData): Array<{ estimate: { laborInsurance: { monthlyBenefitRealTwd: string | null }; laborPension: { monthlyBenefitRealTwd: string | null } } | null }>
}

export interface ScenarioResult {
  scenarioId: string
  name: string
  inputHash: string
  status: CalculationResult['status'] | 'unavailable'
  retirementAgeInMonths: number | null
  retirementAssetsAtRetirement: string | null
  readinessRate: string | null
  retirementIncomeMonthlyRealTwd: string | null
  contractVersion: string
  ruleVersion: string
  warnings: string[]
}

export function applyScenario(data: PlannerData, scenario: PlannerScenario): PlannerData {
  const next = structuredClone(data)
  const primary = next.members.find((member) => member.id === next.household.primaryMemberId)
  if (!primary) throw new Error('PRIMARY_MEMBER_MISSING')
  const override = scenario.overrides
  if (override.plannedRetirementMonth) {
    primary.plannedRetirementMonth = override.plannedRetirementMonth
    next.retirementPlan.earliestRetirementMonth = override.plannedRetirementMonth
  }
  if (override.additionalMonthlyContributionTwd && new Decimal(override.additionalMonthlyContributionTwd).gt(0)) {
    next.contributions.push({ id: `scenario-${scenario.id}-contribution`, householdId: next.household.id, sourceMemberId: primary.id, amount: { amount: override.additionalMonthlyContributionTwd, currency: 'TWD' }, usageScope: 'household', startDate: next.calculationBaseDate, endRule: 'ownerRetirement', returnProfileId: next.retirementPlan.defaultReturnProfileId, status: 'provided', createdAt: scenario.createdAt, updatedAt: scenario.updatedAt })
  }
  if (override.primaryLaborPensionVoluntaryRate) {
    const system = next.retirementSystems.find((item) => item.memberId === primary.id)
    if (!system || system.status !== 'provided' || !system.laborPension.enabled) throw new Error('LABOR_PENSION_DATA_REQUIRED')
    system.laborPension.voluntaryContributionRate = override.primaryLaborPensionVoluntaryRate
  }
  return next
}

export class ScenarioService {
  constructor(private readonly engines: Engines) {}

  async run(data: PlannerData, scenario: PlannerScenario): Promise<ScenarioResult> {
    try {
      const trial = applyScenario(data, scenario)
      const [calculation, projection] = await Promise.all([this.engines.calculate(trial), this.engines.project(trial)])
      const retirementIncome = this.engines.retirementSystems(trial).reduce((sum, item) => sum.plus(item.estimate?.laborInsurance.monthlyBenefitRealTwd ?? 0).plus(item.estimate?.laborPension.monthlyBenefitRealTwd ?? 0), new Decimal(0))
      const inputHash = await sha256({ baseDataUpdatedAt: scenario.baseDataUpdatedAt, contractVersion: scenario.contractVersion, ruleVersion: scenario.ruleVersion, overrides: scenario.overrides })
      return { scenarioId: scenario.id, name: scenario.name, inputHash, status: calculation.status, retirementAgeInMonths: calculation.retirementAgeInMonths, retirementAssetsAtRetirement: calculation.retirementAssetsAtRetirement, readinessRate: projection.readinessRate, retirementIncomeMonthlyRealTwd: retirementIncome.toFixed(2), contractVersion: scenario.contractVersion, ruleVersion: scenario.ruleVersion, warnings: calculation.errors.map((item) => item.message) }
    } catch (error) {
      const inputHash = await sha256({ baseDataUpdatedAt: scenario.baseDataUpdatedAt, contractVersion: scenario.contractVersion, ruleVersion: scenario.ruleVersion, overrides: scenario.overrides })
      return { scenarioId: scenario.id, name: scenario.name, inputHash, status: 'unavailable', retirementAgeInMonths: null, retirementAssetsAtRetirement: null, readinessRate: null, retirementIncomeMonthlyRealTwd: null, contractVersion: scenario.contractVersion, ruleVersion: scenario.ruleVersion, warnings: [error instanceof Error && error.message === 'LABOR_PENSION_DATA_REQUIRED' ? '需先提供主要規劃人的勞退資料，才能試算自提情境。' : '情境資料無法完成試算。'] }
    }
  }

  compare(data: PlannerData): Promise<ScenarioResult[]> {
    const baseline: PlannerScenario = { id: 'baseline', householdId: data.household.id, name: '基準方案', version: 'scenario-v0.1', baseDataUpdatedAt: data.updatedAt, contractVersion: 'calculation-contract-v0.1', ruleVersion: 'tw-labor-rules-2026-08-20', overrides: {}, createdAt: data.updatedAt, updatedAt: data.updatedAt }
    return Promise.all([baseline, ...data.scenarios].map((scenario) => this.run(data, scenario)))
  }
}
