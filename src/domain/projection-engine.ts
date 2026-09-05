import Decimal from 'decimal.js'
import { addMonths, monthIndex, toMonth } from './date'
import type { CalculationMessage, ProjectionInput, ProjectionResult, ProjectionScenario, AssetScenarioRates } from './models'

const ZERO = new Decimal(0)
const HORIZONS = [10, 15, 20, 25, 30, 35] as const
const SCENARIOS: Array<Pick<ProjectionScenario, 'id' | 'label' | 'returnAdjustment'>> = [
  { id: 'conservative', label: '保守', returnAdjustment: '-0.02' },
  { id: 'balanced', label: '穩健', returnAdjustment: '0' },
  { id: 'optimistic', label: '樂觀', returnAdjustment: '0.02' },
]

const money = (value: Decimal) => value.toDecimalPlaces(2).toFixed(2)
const adjustedMonthlyRate = (annualRate: string, adjustment: string) => {
  const rate = Decimal.max('-.99', new Decimal(annualRate).plus(adjustment))
  return new Decimal(1).plus(rate).pow(new Decimal(1).div(12)).minus(1)
}

function assetMonthlyRate(asset: { annualReturnRate: string; scenarioRates?: AssetScenarioRates }, scenario: Pick<ProjectionScenario, 'id' | 'returnAdjustment'>) {
  if (!asset.scenarioRates) return adjustedMonthlyRate(asset.annualReturnRate, scenario.returnAdjustment)
  return scenario.id === 'custom' ? adjustedMonthlyRate(asset.scenarioRates.balanced, scenario.returnAdjustment) : adjustedMonthlyRate(asset.scenarioRates[scenario.id], '0')
}

export async function projectRetirement(input: ProjectionInput): Promise<ProjectionResult> {
  if (input.contractVersion !== 'projection-contract-v0.2') throw new Error('UNSUPPORTED_PROJECTION_CONTRACT')
  const baseMonth = toMonth(input.calculationBaseDate)
  const inflation = new Decimal(input.annualInflationRate)
  if (inflation.lte(-1)) throw new Error('INVALID_INFLATION_RATE')

  const warnings: CalculationMessage[] = []
  const assets = input.assets.filter((asset) => asset.status === 'provided')
  const excludedAssets = input.assets.filter((asset) => asset.status !== 'provided').map((asset) => ({ id: asset.id, reason: asset.status === 'notProvided' ? '資產金額尚未提供' : '資產標記為不適用' }))
  input.assets.filter((asset) => asset.status === 'notProvided').forEach((asset) => warnings.push({ code: 'ASSET_NOT_PROVIDED', message: `投資資產「${asset.name}」尚未提供。`, entityId: asset.id }))
  input.contributions.filter((item) => item.status === 'notProvided').forEach((item) => warnings.push({ code: 'CONTRIBUTION_NOT_PROVIDED', message: `投入「${item.id}」尚未提供。`, entityId: item.id }))
  input.laborPensions.filter((item) => item.status === 'notProvided').forEach((item) => warnings.push({ code: 'LABOR_PENSION_NOT_PROVIDED', message: `${item.memberName}的勞退資料尚未提供。`, entityId: item.id }))

  if (input.customScenario) {
    const adjustment = new Decimal(input.customScenario.returnAdjustment)
    if (!adjustment.isFinite() || adjustment.lt(-1) || adjustment.gt(1)) throw new Error('INVALID_CUSTOM_RETURN_ADJUSTMENT')
  }
  const definitions = input.customScenario ? [...SCENARIOS, { id: 'custom' as const, label: '自訂', returnAdjustment: input.customScenario.returnAdjustment }] : SCENARIOS
  const scenarios = definitions.map((scenario) => {
    const investmentBalances = assets.map((asset) => ({ ...asset, balance: new Decimal(asset.currentValueTwd), active: monthIndex(asset.availableFrom) <= monthIndex(baseMonth) }))
    const contributionBalances = input.contributions.filter((item) => item.status === 'provided').map((item) => ({ ...item, balance: ZERO }))
    const pensionBalances = input.laborPensions.filter((item) => item.status === 'provided').map((item) => ({ ...item, balance: new Decimal(item.currentBalanceTwd) }))
    const milestoneByMonth = new Map<number, typeof HORIZONS[number]>(HORIZONS.map((years) => [monthIndex(addMonths(baseMonth, years * 12)), years]))
    const milestones: ProjectionScenario['milestones'] = []
    const lastIndex = monthIndex(addMonths(baseMonth, HORIZONS.at(-1)! * 12))

    for (let cursor = monthIndex(baseMonth); cursor <= lastIndex; cursor += 1) {
      const month = addMonths(baseMonth, cursor - monthIndex(baseMonth))
      for (const asset of investmentBalances) {
        if (!asset.active && cursor >= monthIndex(asset.availableFrom)) asset.active = true
        if (asset.active && cursor > monthIndex(baseMonth)) asset.balance = asset.balance.mul(assetMonthlyRate(asset, scenario).plus(1))
      }
      for (const contribution of contributionBalances) {
        if (cursor > monthIndex(baseMonth)) contribution.balance = contribution.balance.mul(assetMonthlyRate(contribution, scenario).plus(1))
        if (month >= contribution.startMonth && (!contribution.endMonth || month < contribution.endMonth)) contribution.balance = contribution.balance.plus(contribution.amountTwd)
      }
      for (const pension of pensionBalances) {
        const adjustment = scenario.id === 'custom' && !input.customScenario?.adjustLaborPension ? '0' : scenario.returnAdjustment
        if (cursor > monthIndex(baseMonth) && month <= pension.claimMonth) pension.balance = pension.balance.mul(adjustedMonthlyRate(pension.annualReturnRate, adjustment).plus(1)).plus(pension.monthlyContributionTwd)
      }

      const years = milestoneByMonth.get(cursor)
      if (years) {
        const investment = investmentBalances.reduce((sum, item) => sum.plus(item.active ? item.balance : ZERO), ZERO).plus(contributionBalances.reduce((sum, item) => sum.plus(item.balance), ZERO))
        const laborPension = pensionBalances.reduce((sum, item) => sum.plus(item.balance), ZERO)
        const total = investment.plus(laborPension)
        const real = total.div(new Decimal(1).plus(inflation).pow(years))
        milestones.push({ yearsFromNow: years, month, investmentAssetsNominal: money(investment), laborPensionAssetsNominal: money(laborPension), totalAssetsNominal: money(total), totalAssetsReal: money(real) })
      }
    }
    return { ...scenario, milestones }
  })

  return { contractVersion: 'projection-contract-v0.2', calculationBaseDate: input.calculationBaseDate, inflationRate: input.annualInflationRate, horizons: [...HORIZONS], scenarios, warnings, includedAssetIds: assets.map((asset) => asset.id), excludedAssets }
}
