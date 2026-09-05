import Decimal from 'decimal.js'
import { sha256 } from '../domain/canonical'
import type { ProjectionResult } from '../domain/models'
import type { PlannerData, PlannerScenario } from './planner-data'

interface Engines { project(data: PlannerData): Promise<ProjectionResult> }
export interface ScenarioResult { scenarioId: string; name: string; inputHash: string; status: 'available' | 'unavailable'; futureAssetsReal: Partial<Record<10 | 20 | 30 | 35, string>>; contractVersion: string; ruleVersion: string; warnings: string[] }

export function applyScenario(data: PlannerData, scenario: PlannerScenario): PlannerData {
  const next = structuredClone(data)
  const primary = next.members.find((member) => member.id === next.household.primaryMemberId)
  if (!primary) throw new Error('PRIMARY_MEMBER_MISSING')
  const override = scenario.overrides
  if (override.plannedRetirementMonth) primary.plannedRetirementMonth = override.plannedRetirementMonth
  if (override.additionalMonthlyContributionTwd && new Decimal(override.additionalMonthlyContributionTwd).gt(0)) {
    next.contributions.push({ id: `scenario-${scenario.id}-contribution`, householdId: next.household.id, sourceMemberId: primary.id, amount: { amount: override.additionalMonthlyContributionTwd, currency: 'TWD' }, usageScope: 'household', startDate: next.calculationBaseDate, endRule: override.plannedRetirementMonth ? 'ownerRetirement' : 'planEnd', returnProfileId: next.retirementPlan.defaultReturnProfileId, status: 'provided', createdAt: scenario.createdAt, updatedAt: scenario.updatedAt })
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
    const inputHash = await sha256({ baseDataUpdatedAt: scenario.baseDataUpdatedAt, contractVersion: 'projection-contract-v0.2', ruleVersion: scenario.ruleVersion, overrides: scenario.overrides })
    try {
      const projection = await this.engines.project(applyScenario(data, scenario))
      const balanced = projection.scenarios.find((item) => item.id === 'balanced')
      const futureAssetsReal = Object.fromEntries((balanced?.milestones ?? []).filter((item) => [10, 20, 30, 35].includes(item.yearsFromNow)).map((item) => [item.yearsFromNow, item.totalAssetsReal]))
      return { scenarioId: scenario.id, name: scenario.name, inputHash, status: 'available', futureAssetsReal, contractVersion: projection.contractVersion, ruleVersion: scenario.ruleVersion, warnings: projection.warnings.map((item) => item.message) }
    } catch (error) {
      return { scenarioId: scenario.id, name: scenario.name, inputHash, status: 'unavailable', futureAssetsReal: {}, contractVersion: 'projection-contract-v0.2', ruleVersion: scenario.ruleVersion, warnings: [error instanceof Error && error.message === 'LABOR_PENSION_DATA_REQUIRED' ? '需先提供主要規劃人的勞退資料，才能試算自提情境。' : '情境資料無法完成試算。'] }
    }
  }
  compare(data: PlannerData): Promise<ScenarioResult[]> {
    const baseline: PlannerScenario = { id: 'baseline', householdId: data.household.id, name: '目前投入計畫', version: 'scenario-v0.1', baseDataUpdatedAt: data.updatedAt, contractVersion: 'calculation-contract-v0.1', ruleVersion: 'tw-labor-rules-2026-08-20', overrides: {}, createdAt: data.updatedAt, updatedAt: data.updatedAt }
    return Promise.all([baseline, ...data.scenarios].map((scenario) => this.run(data, scenario)))
  }
}
