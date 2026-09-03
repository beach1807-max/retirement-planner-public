import type { PlannerData } from './planner-data'

export function migratePlannerData(value: unknown): PlannerData {
  const data = value as Record<string, unknown> & { schemaVersion?: string; updatedAt?: string }
  if (!data || typeof data !== 'object') throw new Error('INVALID_PLANNER_DATA')
  const marketFields = { instruments: [], marketQuotes: [], exchangeRates: [], marketDataStamps: [] }
  if (data.schemaVersion === 'planner-data-v0.7') {
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
  if (data.schemaVersion === 'planner-data-v0.6') return { ...(data as unknown as Omit<PlannerData, 'schemaVersion' | keyof typeof marketFields>), schemaVersion: 'planner-data-v0.7', ...marketFields }
  if (data.schemaVersion === 'planner-data-v0.5') return { ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'scenarios' | keyof typeof marketFields>), schemaVersion: 'planner-data-v0.7', scenarios: [], ...marketFields }
  if (data.schemaVersion === 'planner-data-v0.4') return { ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'portfolios' | 'scenarios' | keyof typeof marketFields>), schemaVersion: 'planner-data-v0.7', portfolios: [], scenarios: [], ...marketFields }
  if (data.schemaVersion === 'planner-data-v0.3') return { ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'retirementSystems' | 'portfolios' | 'scenarios' | keyof typeof marketFields>), schemaVersion: 'planner-data-v0.7', retirementSystems: [], portfolios: [], scenarios: [], ...marketFields }
  if (data.schemaVersion === 'planner-data-v0.2') return { ...(data as unknown as Omit<PlannerData, 'schemaVersion' | 'accounts' | 'holdings' | 'incomes' | 'expenses' | 'liabilities' | 'retirementSystems' | 'portfolios' | 'scenarios' | keyof typeof marketFields>), schemaVersion: 'planner-data-v0.7', accounts: [], holdings: [], incomes: [], expenses: [], liabilities: [], retirementSystems: [], portfolios: [], scenarios: [], ...marketFields }
  if (data.schemaVersion !== 'planner-data-v0.1' || typeof data.updatedAt !== 'string') throw new Error('UNSUPPORTED_SCHEMA_VERSION')
  const legacy = data as unknown as {
    calculationBaseDate: string; household: PlannerData['household']; members: PlannerData['members'];
    assets: Array<Omit<PlannerData['assets'][number], 'currentValue'> & { currentValueTwd: string }>;
    contributions: Array<Omit<PlannerData['contributions'][number], 'amount'> & { amountTwd: string }>;
    retirementPlan: PlannerData['retirementPlan']; assumptions: PlannerData['assumptions']; updatedAt: string
  }
  const timestamp = legacy.updatedAt
  return {
    schemaVersion: 'planner-data-v0.7', calculationBaseDate: legacy.calculationBaseDate,
    household: { ...legacy.household, createdAt: legacy.household.createdAt ?? timestamp, updatedAt: legacy.household.updatedAt ?? timestamp },
    members: legacy.members.map((member) => ({ ...member, createdAt: member.createdAt ?? timestamp, updatedAt: member.updatedAt ?? timestamp })),
    assets: legacy.assets.map(({ currentValueTwd, ...asset }) => ({ ...asset, currentValue: { amount: currentValueTwd, currency: 'TWD' }, createdAt: asset.createdAt ?? timestamp, updatedAt: asset.updatedAt ?? timestamp })),
    contributions: legacy.contributions.map(({ amountTwd, ...contribution }) => ({ ...contribution, amount: { amount: amountTwd, currency: 'TWD' }, createdAt: contribution.createdAt ?? timestamp, updatedAt: contribution.updatedAt ?? timestamp })),
    retirementPlan: legacy.retirementPlan, assumptions: legacy.assumptions,
    accounts: [], holdings: [], incomes: [], expenses: [], liabilities: [], retirementSystems: [], portfolios: [], scenarios: [], ...marketFields,
    ruleVersion: 'rules-none-v0.1', retirementMode: 'support-to-plan-end-v0.1', updatedAt: timestamp,
  }
}
