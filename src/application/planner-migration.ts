import type { PlannerData } from './planner-data'

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
  const toV08 = (current: Omit<PlannerData, 'schemaVersion'> & { schemaVersion?: string }): PlannerData => ({
    ...current,
    schemaVersion: 'planner-data-v0.8',
    assets: current.assets.map((asset) => ({ ...asset, allocationClass: allocationClass(asset) })),
    portfolios: current.portfolios.map((portfolio) => ({
      ...portfolio,
      targets: portfolio.targets.map((target) => {
        const legacyClass = target.assetClass as string
        return { ...target, assetClass: legacyClass === 'stockEtf' ? 'stock' : legacyClass === 'fund' ? 'other' : legacyClass }
      }) as PlannerData['portfolios'][number]['targets'],
    })),
  })
  if (data.schemaVersion === 'planner-data-v0.8') {
    const current = data as unknown as PlannerData
    if ([current.instruments, current.marketQuotes, current.exchangeRates, current.marketDataStamps].every(Array.isArray)) return current
    return {
      ...current,
      instruments: Array.isArray(current.instruments) ? current.instruments : [],
      marketQuotes: Array.isArray(current.marketQuotes) ? current.marketQuotes : [],
      exchangeRates: Array.isArray(current.exchangeRates) ? current.exchangeRates : [],
      marketDataStamps: Array.isArray(current.marketDataStamps) ? current.marketDataStamps : [],
    }
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
    return toV08(normalized)
  }
  if (data.schemaVersion === 'planner-data-v0.6') return toV08({ ...(data as unknown as Omit<PlannerData, 'schemaVersion' | keyof typeof marketFields>), ...marketFields })
  if (data.schemaVersion === 'planner-data-v0.5') return toV08({ ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'scenarios' | keyof typeof marketFields>), scenarios: [], ...marketFields })
  if (data.schemaVersion === 'planner-data-v0.4') return toV08({ ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'portfolios' | 'scenarios' | keyof typeof marketFields>), portfolios: [], scenarios: [], ...marketFields })
  if (data.schemaVersion === 'planner-data-v0.3') return toV08({ ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'retirementSystems' | 'portfolios' | 'scenarios' | keyof typeof marketFields>), retirementSystems: [], portfolios: [], scenarios: [], ...marketFields })
  if (data.schemaVersion === 'planner-data-v0.2') return toV08({ ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'accounts' | 'holdings' | 'incomes' | 'expenses' | 'liabilities' | 'retirementSystems' | 'portfolios' | 'scenarios' | keyof typeof marketFields>), accounts: [], holdings: [], incomes: [], expenses: [], liabilities: [], retirementSystems: [], portfolios: [], scenarios: [], ...marketFields })
  if (data.schemaVersion !== 'planner-data-v0.1' || typeof data.updatedAt !== 'string') throw new Error('UNSUPPORTED_SCHEMA_VERSION')
  const legacy = data as unknown as {
    calculationBaseDate: string; household: PlannerData['household']; members: PlannerData['members'];
    assets: Array<Omit<PlannerData['assets'][number], 'currentValue'> & { currentValueTwd: string }>;
    contributions: Array<Omit<PlannerData['contributions'][number], 'amount'> & { amountTwd: string }>;
    retirementPlan: PlannerData['retirementPlan']; assumptions: PlannerData['assumptions']; updatedAt: string
  }
  const timestamp = legacy.updatedAt
  return {
    schemaVersion: 'planner-data-v0.8', calculationBaseDate: legacy.calculationBaseDate,
    household: { ...legacy.household, createdAt: legacy.household.createdAt ?? timestamp, updatedAt: legacy.household.updatedAt ?? timestamp },
    members: legacy.members.map((member) => ({ ...member, createdAt: member.createdAt ?? timestamp, updatedAt: member.updatedAt ?? timestamp })),
    assets: legacy.assets.map(({ currentValueTwd, ...asset }) => ({ ...asset, allocationClass: allocationClass(asset), currentValue: { amount: currentValueTwd, currency: 'TWD' }, createdAt: asset.createdAt ?? timestamp, updatedAt: asset.updatedAt ?? timestamp })),
    contributions: legacy.contributions.map(({ amountTwd, ...contribution }) => ({ ...contribution, amount: { amount: amountTwd, currency: 'TWD' }, createdAt: contribution.createdAt ?? timestamp, updatedAt: contribution.updatedAt ?? timestamp })),
    retirementPlan: legacy.retirementPlan, assumptions: legacy.assumptions,
    accounts: [], holdings: [], incomes: [], expenses: [], liabilities: [], retirementSystems: [], portfolios: [], scenarios: [], ...marketFields,
    ruleVersion: 'rules-none-v0.1', retirementMode: 'support-to-plan-end-v0.1', updatedAt: timestamp,
  }
}
