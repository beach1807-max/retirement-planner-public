import type { PlannerData } from './planner-data'
import { cloneDefaultAssetReturnPresets } from '../domain/default-return-presets'

export function migratePlannerData(value: unknown): PlannerData {
  const data = value as Record<string, unknown> & { schemaVersion?: string; updatedAt?: string }
  if (!data || typeof data !== 'object') throw new Error('INVALID_PLANNER_DATA')
  const marketFields = { instruments: [], marketQuotes: [], exchangeRates: [], marketDataStamps: [] }
  const allocationClass = (asset: { assetType: string; allocationClass?: PlannerData['assets'][number]['allocationClass'] }) => asset.allocationClass ?? (
    asset.assetType === 'cash' || asset.assetType === 'timeDeposit' ? 'cash'
      : asset.assetType === 'stock' || asset.assetType === 'etf' || asset.assetType === 'stockEtf' ? 'stock'
        : asset.assetType === 'bond' ? 'bond'
          : asset.assetType === 'moneyMarketFund' ? 'moneyMarket'
            : 'other'
  )
  const toV09 = (current: Omit<PlannerData, 'schemaVersion'> & { schemaVersion?: string }): PlannerData => ({
    ...current,
    schemaVersion: 'planner-data-v0.9',
    assumptions: { ...current.assumptions, assetReturnPresets: current.assumptions.assetReturnPresets ?? cloneDefaultAssetReturnPresets() },
    assets: current.assets.map((asset) => ({ ...asset, allocationClass: allocationClass(asset) })),
    scenarios: current.scenarios.map((scenario) => {
      const legacy = scenario as unknown as { version?: string; id: string; createdAt: string; updatedAt: string; overrides?: { plannedRetirementMonth?: string; additionalMonthlyContributionTwd?: string; primaryLaborPensionVoluntaryRate?: string } }
      if (legacy.version === 'scenario-v0.2') return scenario
      const overrides = legacy.overrides ?? {}
      return {
        ...scenario,
        version: 'scenario-v0.2',
        overrides: {
          memberRetirement: overrides.plannedRetirementMonth ? [{ memberId: current.household.primaryMemberId, plannedRetirementMonth: overrides.plannedRetirementMonth }] : undefined,
          additionalContributions: overrides.additionalMonthlyContributionTwd ? [{ id: `migrated-${legacy.id}`, sourceMemberId: current.household.primaryMemberId, amountTwd: overrides.additionalMonthlyContributionTwd, startDate: current.calculationBaseDate, endRule: overrides.plannedRetirementMonth ? 'ownerRetirement' : 'planEnd', returnProfileId: current.retirementPlan.defaultReturnProfileId }] : undefined,
          retirementSystems: overrides.primaryLaborPensionVoluntaryRate ? [{ memberId: current.household.primaryMemberId, laborPensionVoluntaryRate: overrides.primaryLaborPensionVoluntaryRate }] : undefined,
        },
      }
    }) as PlannerData['scenarios'],
    portfolios: current.portfolios.map((portfolio) => ({
      ...portfolio,
      targets: portfolio.targets.map((target) => {
        const legacyClass = target.assetClass as string
        return { ...target, assetClass: legacyClass === 'stockEtf' ? 'stock' : legacyClass === 'fund' ? 'other' : legacyClass }
      }) as PlannerData['portfolios'][number]['targets'],
    })),
  })
  if (data.schemaVersion === 'planner-data-v0.9') {
    const current = data as unknown as PlannerData
    if ([current.instruments, current.marketQuotes, current.exchangeRates, current.marketDataStamps].every(Array.isArray) && Array.isArray(current.assumptions?.assetReturnPresets)) return current
    return toV09({ ...current, instruments: Array.isArray(current.instruments) ? current.instruments : [], marketQuotes: Array.isArray(current.marketQuotes) ? current.marketQuotes : [], exchangeRates: Array.isArray(current.exchangeRates) ? current.exchangeRates : [], marketDataStamps: Array.isArray(current.marketDataStamps) ? current.marketDataStamps : [] })
  }
  if (data.schemaVersion === 'planner-data-v0.8') {
    const current = data as unknown as PlannerData
    if ([current.instruments, current.marketQuotes, current.exchangeRates, current.marketDataStamps].every(Array.isArray)) return toV09(current)
    return toV09({
      ...current,
      instruments: Array.isArray(current.instruments) ? current.instruments : [],
      marketQuotes: Array.isArray(current.marketQuotes) ? current.marketQuotes : [],
      exchangeRates: Array.isArray(current.exchangeRates) ? current.exchangeRates : [],
      marketDataStamps: Array.isArray(current.marketDataStamps) ? current.marketDataStamps : [],
    })
  }
  if (data.schemaVersion === 'planner-data-v0.7') {
    const current = data as unknown as PlannerData
    const normalized = [current.instruments, current.marketQuotes, current.exchangeRates, current.marketDataStamps].every(Array.isArray) ? current : {
      ...current,
      instruments: Array.isArray(current.instruments) ? current.instruments : [],
      marketQuotes: Array.isArray(current.marketQuotes) ? current.marketQuotes : [],
      exchangeRates: Array.isArray(current.exchangeRates) ? current.exchangeRates : [],
      marketDataStamps: Array.isArray(current.marketDataStamps) ? current.marketDataStamps : [],
    }
    return toV09(normalized)
  }
  if (data.schemaVersion === 'planner-data-v0.6') return toV09({ ...(data as unknown as Omit<PlannerData, 'schemaVersion' | keyof typeof marketFields>), ...marketFields })
  if (data.schemaVersion === 'planner-data-v0.5') return toV09({ ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'scenarios' | keyof typeof marketFields>), scenarios: [], ...marketFields })
  if (data.schemaVersion === 'planner-data-v0.4') return toV09({ ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'portfolios' | 'scenarios' | keyof typeof marketFields>), portfolios: [], scenarios: [], ...marketFields })
  if (data.schemaVersion === 'planner-data-v0.3') return toV09({ ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'retirementSystems' | 'portfolios' | 'scenarios' | keyof typeof marketFields>), retirementSystems: [], portfolios: [], scenarios: [], ...marketFields })
  if (data.schemaVersion === 'planner-data-v0.2') return toV09({ ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'accounts' | 'holdings' | 'incomes' | 'expenses' | 'liabilities' | 'retirementSystems' | 'portfolios' | 'scenarios' | keyof typeof marketFields>), accounts: [], holdings: [], incomes: [], expenses: [], liabilities: [], retirementSystems: [], portfolios: [], scenarios: [], ...marketFields })
  if (data.schemaVersion !== 'planner-data-v0.1' || typeof data.updatedAt !== 'string') throw new Error('UNSUPPORTED_SCHEMA_VERSION')
  const legacy = data as unknown as {
    calculationBaseDate: string; household: PlannerData['household']; members: PlannerData['members'];
    assets: Array<Omit<PlannerData['assets'][number], 'currentValue'> & { currentValueTwd: string }>;
    contributions: Array<Omit<PlannerData['contributions'][number], 'amount'> & { amountTwd: string }>;
    retirementPlan: PlannerData['retirementPlan']; assumptions: PlannerData['assumptions']; updatedAt: string
  }
  const timestamp = legacy.updatedAt
  return {
    schemaVersion: 'planner-data-v0.9', calculationBaseDate: legacy.calculationBaseDate,
    household: { ...legacy.household, createdAt: legacy.household.createdAt ?? timestamp, updatedAt: legacy.household.updatedAt ?? timestamp },
    members: legacy.members.map((member) => ({ ...member, createdAt: member.createdAt ?? timestamp, updatedAt: member.updatedAt ?? timestamp })),
    assets: legacy.assets.map(({ currentValueTwd, ...asset }) => ({ ...asset, allocationClass: allocationClass(asset), currentValue: { amount: currentValueTwd, currency: 'TWD' }, createdAt: asset.createdAt ?? timestamp, updatedAt: asset.updatedAt ?? timestamp })),
    contributions: legacy.contributions.map(({ amountTwd, ...contribution }) => ({ ...contribution, amount: { amount: amountTwd, currency: 'TWD' }, createdAt: contribution.createdAt ?? timestamp, updatedAt: contribution.updatedAt ?? timestamp })),
    retirementPlan: legacy.retirementPlan, assumptions: { ...legacy.assumptions, assetReturnPresets: cloneDefaultAssetReturnPresets() },
    accounts: [], holdings: [], incomes: [], expenses: [], liabilities: [], retirementSystems: [], portfolios: [], scenarios: [], ...marketFields,
    ruleVersion: 'rules-none-v0.1', retirementMode: 'support-to-plan-end-v0.1', updatedAt: timestamp,
  }
}
