import Decimal from 'decimal.js'
import { sha256 } from '../domain/canonical'
import type { ProjectionResult } from '../domain/models'
import type { PlannerData, PlannerScenario } from './planner-data'
import { validatePlannerData } from './planner-service'

type Years = 10 | 15 | 20 | 25 | 30 | 35
interface Engines { project(data: PlannerData): Promise<ProjectionResult> }
export interface ScenarioMilestoneResult { years: Years; totalAssetsNominal: string; totalAssetsReal: string; deltaNominalVsBaseline: string; deltaRealVsBaseline: string }
export interface ScenarioResult { scenarioId: string; name: string; inputHash: string; status: 'available' | 'unavailable'; basis: 'conservative' | 'balanced' | 'optimistic'; milestones: ScenarioMilestoneResult[]; contractVersion: string; ruleVersion: string; warnings: string[] }

function applyRebalance(data: PlannerData, targetWeights: NonNullable<PlannerScenario['overrides']['rebalance']>['targetWeights']) {
  const portfolio = data.portfolios[0]
  if (!portfolio) return
  const total = targetWeights.reduce((sum, item) => sum.plus(item.targetWeight), new Decimal(0))
  if (!total.eq(1) || targetWeights.some((item) => new Decimal(item.targetWeight).lt(0))) throw new Error('SCENARIO_REBALANCE_INVALID_TARGET')
  const assets = data.assets.filter((asset) => portfolio.assetIds.includes(asset.id) && asset.status === 'provided' && asset.currentValue.currency === 'TWD' && asset.allocationClass)
  const value = assets.reduce((sum, asset) => sum.plus(asset.currentValue.amount), new Decimal(0))
  for (const target of targetWeights) {
    const classAssets = assets.filter((asset) => asset.allocationClass === target.assetClass)
    if (new Decimal(target.targetWeight).gt(0) && (classAssets.length === 0 || classAssets.every((asset) => new Decimal(asset.currentValue.amount).eq(0)))) throw new Error('SCENARIO_REBALANCE_CLASS_MISSING_ASSET')
    const classValue = classAssets.reduce((sum, asset) => sum.plus(asset.currentValue.amount), new Decimal(0))
    if (classAssets.length && classValue.gt(0)) for (const asset of classAssets) asset.currentValue.amount = value.mul(target.targetWeight).mul(asset.currentValue.amount).div(classValue).toString()
  }
}

export function applyScenario(data: PlannerData, scenario: PlannerScenario): PlannerData {
  const next = structuredClone(data)
  const override = scenario.overrides
  for (const item of override.memberRetirement ?? []) {
    const member = next.members.find((candidate) => candidate.id === item.memberId)
    if (!member) throw new Error('SCENARIO_MEMBER_NOT_FOUND')
    member.plannedRetirementMonth = item.plannedRetirementMonth
  }
  for (const item of override.contributionOverrides ?? []) {
    const contribution = next.contributions.find((candidate) => candidate.id === item.contributionId)
    if (!contribution) throw new Error('SCENARIO_CONTRIBUTION_NOT_FOUND')
    if (item.amountTwd !== undefined) contribution.amount.amount = item.amountTwd
    if (item.startDate !== undefined) contribution.startDate = item.startDate
    if (item.endRule !== undefined) contribution.endRule = item.endRule
    if (item.endDate !== undefined) contribution.endDate = item.endDate
  }
  for (const item of override.additionalContributions ?? []) next.contributions.push({ id: `scenario-${scenario.id}-${item.id}`, householdId: next.household.id, sourceMemberId: item.sourceMemberId, amount: { amount: item.amountTwd, currency: 'TWD' }, usageScope: 'household', startDate: item.startDate, endRule: item.endRule, endDate: item.endDate, destinationAssetId: item.destinationAssetId, returnProfileId: item.returnProfileId, status: 'provided', createdAt: scenario.createdAt, updatedAt: scenario.updatedAt })
  for (const item of override.assetRates ?? []) {
    const asset = next.assets.find((candidate) => candidate.id === item.assetId)
    if (!asset) throw new Error('SCENARIO_ASSET_NOT_FOUND')
    asset.scenarioRates = item.scenarioRates
  }
  if (override.annualInflationRate !== undefined) next.assumptions.annualInflationRate = override.annualInflationRate
  for (const item of override.retirementSystems ?? []) {
    const system = next.retirementSystems.find((candidate) => candidate.memberId === item.memberId)
    if (!system || system.status !== 'provided') throw new Error('LABOR_PENSION_DATA_REQUIRED')
    if (item.laborInsuranceClaimAge !== undefined) system.laborInsurance.claimAge = item.laborInsuranceClaimAge
    if (item.laborPensionVoluntaryRate !== undefined) system.laborPension.voluntaryContributionRate = item.laborPensionVoluntaryRate
    if (item.laborPensionClaimAge !== undefined) system.laborPension.claimAge = item.laborPensionClaimAge
    if (item.laborPensionClaimMode !== undefined) system.laborPension.claimMode = item.laborPensionClaimMode
  }
  if (override.rebalance) applyRebalance(next, override.rebalance.targetWeights)
  validatePlannerData(next)
  return next
}

function milestones(projection: ProjectionResult, basis: ScenarioResult['basis']): ScenarioMilestoneResult[] {
  const scenario = projection.scenarios.find((item) => item.id === basis)
  return (scenario?.milestones ?? []).map((item) => ({ years: item.yearsFromNow, totalAssetsNominal: item.totalAssetsNominal, totalAssetsReal: item.totalAssetsReal, deltaNominalVsBaseline: '0', deltaRealVsBaseline: '0' }))
}

export class ScenarioService {
  constructor(private readonly engines: Engines) {}
  async run(data: PlannerData, scenario: PlannerScenario, basis: ScenarioResult['basis'] = 'balanced'): Promise<ScenarioResult> {
    const inputHash = await sha256({ baseDataUpdatedAt: scenario.baseDataUpdatedAt, contractVersion: 'projection-contract-v0.2', ruleVersion: scenario.ruleVersion, overrides: scenario.overrides, basis })
    try {
      const projection = await this.engines.project(applyScenario(data, scenario))
      return { scenarioId: scenario.id, name: scenario.name, inputHash, status: 'available', basis, milestones: milestones(projection, basis), contractVersion: projection.contractVersion, ruleVersion: scenario.ruleVersion, warnings: projection.warnings.map((item) => item.message) }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN'
      const warning = code === 'LABOR_PENSION_DATA_REQUIRED' ? '需先提供該成員的勞退資料，才能試算制度覆寫。' : code === 'SCENARIO_REBALANCE_CLASS_MISSING_ASSET' ? 'SCENARIO_REBALANCE_CLASS_MISSING_ASSET：目標配置需要目前投資組合沒有的資產類別。' : '情境資料無法完成試算。'
      return { scenarioId: scenario.id, name: scenario.name, inputHash, status: 'unavailable', basis, milestones: [], contractVersion: 'projection-contract-v0.2', ruleVersion: scenario.ruleVersion, warnings: [warning] }
    }
  }
  async compare(data: PlannerData, basis: ScenarioResult['basis'] = 'balanced'): Promise<ScenarioResult[]> {
    const baseline: PlannerScenario = { id: 'baseline', householdId: data.household.id, name: '目前方案', version: 'scenario-v0.2', baseDataUpdatedAt: data.updatedAt, contractVersion: 'calculation-contract-v0.1', ruleVersion: 'tw-labor-rules-2026-08-20', overrides: {}, createdAt: data.updatedAt, updatedAt: data.updatedAt }
    const results = await Promise.all([baseline, ...data.scenarios].map((scenario) => this.run(data, scenario, basis)))
    const baselineMilestones = new Map(results[0].milestones.map((item) => [item.years, item]))
    return results.map((result) => ({ ...result, milestones: result.milestones.map((item) => {
      const base = baselineMilestones.get(item.years)
      return { ...item, deltaNominalVsBaseline: base ? new Decimal(item.totalAssetsNominal).minus(base.totalAssetsNominal).toString() : '0', deltaRealVsBaseline: base ? new Decimal(item.totalAssetsReal).minus(base.totalAssetsReal).toString() : '0' }
    }) }))
  }
}
