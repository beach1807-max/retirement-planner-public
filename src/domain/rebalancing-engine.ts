import Decimal from 'decimal.js'

export interface AllocationInput { assetClass: string; valueTwd: string }
export interface PortfolioTargetInput { assetClass: string; targetWeight: string }
export interface RebalancingInput { allocations: AllocationInput[]; targets: PortfolioTargetInput[]; driftThreshold: string }
export interface AllocationResult { assetClass: string; valueTwd: string; currentWeight: string; targetWeight: string; drift: string; status: 'withinRange' | 'outOfRange' }
export interface RebalancingResult { status: 'balanced' | 'reviewNeeded' | 'empty'; totalValueTwd: string; allocations: AllocationResult[]; warnings: string[] }

export function calculateRebalancing(input: RebalancingInput): RebalancingResult {
  const threshold = new Decimal(input.driftThreshold)
  if (!threshold.isFinite() || threshold.lt(0) || threshold.gt(1)) throw new Error('INVALID_DRIFT_THRESHOLD')
  if (input.allocations.some((item) => !new Decimal(item.valueTwd).isFinite() || new Decimal(item.valueTwd).lt(0))) throw new Error('INVALID_ALLOCATION_VALUE')
  const targetClasses = new Set(input.targets.map((item) => item.assetClass))
  if (targetClasses.size !== input.targets.length || input.targets.some((item) => !item.assetClass || new Decimal(item.targetWeight).lt(0))) throw new Error('INVALID_PORTFOLIO_TARGET')
  const targetTotal = input.targets.reduce((sum, item) => sum.plus(item.targetWeight), new Decimal(0))
  if (!targetTotal.eq(1)) throw new Error('INVALID_TARGET_TOTAL')
  const actual = new Map<string, Decimal>()
  input.allocations.forEach((item) => actual.set(item.assetClass, (actual.get(item.assetClass) ?? new Decimal(0)).plus(item.valueTwd)))
  const total = [...actual.values()].reduce((sum, value) => sum.plus(value), new Decimal(0))
  if (total.eq(0)) return { status: 'empty', totalValueTwd: '0.00', allocations: [], warnings: ['投資組合目前沒有可計算市值。'] }
  const classes = new Set([...actual.keys(), ...targetClasses])
  const allocations = [...classes].sort().map((assetClass) => {
    const value = actual.get(assetClass) ?? new Decimal(0)
    const target = input.targets.find((item) => item.assetClass === assetClass)
    const targetWeight = new Decimal(target?.targetWeight ?? 0)
    const currentWeight = value.div(total)
    const drift = currentWeight.minus(targetWeight)
    return { assetClass, valueTwd: value.toFixed(2), currentWeight: currentWeight.toFixed(6), targetWeight: targetWeight.toFixed(6), drift: drift.toFixed(6), status: drift.abs().gt(threshold) ? 'outOfRange' as const : 'withinRange' as const }
  })
  const out = allocations.filter((item) => item.status === 'outOfRange')
  return { status: out.length ? 'reviewNeeded' : 'balanced', totalValueTwd: total.toFixed(2), allocations, warnings: out.map((item) => `${item.assetClass} 與目標相差 ${(Number(item.drift) * 100).toFixed(1)} 個百分點，超出允許範圍。`) }
}
