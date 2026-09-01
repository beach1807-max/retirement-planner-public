import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { calculateRetirement } from './calculation-engine'
import type { CalculationInput } from './models'

function fixture(): CalculationInput {
  return {
    contractVersion: 'calculation-contract-v0.1',
    calculationId: 'calc-1',
    calculationBaseDate: '2026-01-01',
    household: { id: 'household-1', name: '測試家庭', baseCurrency: 'TWD', primaryMemberId: 'a' },
    members: [
      { id: 'a', householdId: 'household-1', name: 'A', role: 'primary', birthDate: '1985-12-15', planningEndAge: 50, isActive: true },
      { id: 'b', householdId: 'household-1', name: 'B', role: 'partner', birthDate: '1988-01-15', planningEndAge: 50, plannedRetirementMonth: '2038-01', isActive: true },
    ],
    assets: [
      {
        id: 'asset-a', householdId: 'household-1', name: 'A 資產', assetType: 'cash', ownershipType: 'individual', ownerMemberId: 'a',
        currentValueTwd: '1200000', includeInTotalAssets: true, retirementUsageScope: 'personal', availableFrom: '2026-01-01', returnProfileId: 'zero', status: 'provided',
      },
    ],
    contributions: [],
    retirementPlan: {
      earliestRetirementMonth: '2026-01', retirementExpenseMonthlyRealTwd: '10000', safetyReserveRealTwd: '0', legacyTargetRealTwd: '0',
      defaultReturnProfileId: 'zero', oneTimeExpenses: [],
    },
    assumptions: { annualInflationRate: '0', returnProfiles: [{ id: 'zero', name: '零報酬', annualReturnRate: '0' }] },
    ruleVersion: 'rules-none-v0.1',
  }
}

describe('退休計算引擎', () => {
  it('零報酬、零通膨且剛好支應 120 個月時期末為零並達標', async () => {
    const input = fixture()
    input.members[0].planningEndAge = 50
    const result = await calculateRetirement(input)
    expect(result.status).toBe('success')
    expect(result.earliestRetirementMonth).toBe('2026-01')
    expect(result.endingAssetsReal).toBe('0.00')
    expect(result.monthlyTimeline).toHaveLength(120)
  })

  it('有效年利率 6% 經 12 個月複利後接近 6%', () => {
    const monthly = new Decimal(1.06).pow(new Decimal(1).div(12)).minus(1)
    expect(new Decimal(1).plus(monthly).pow(12).minus(1).toDecimalPlaces(10).toString()).toBe('0.06')
    expect(monthly.toNumber()).not.toBeCloseTo(0.005, 8)
  })

  it('未提供資產會產生提醒，明確為零則不會', async () => {
    const missing = fixture()
    missing.assets[0].status = 'notProvided'
    const missingResult = await calculateRetirement(missing)
    expect(missingResult.warnings.some((warning) => warning.code === 'ASSET_NOT_PROVIDED')).toBe(true)

    const zero = fixture()
    zero.assets[0].currentValueTwd = '0'
    const zeroResult = await calculateRetirement(zero)
    expect(zeroResult.warnings.some((warning) => warning.code === 'ASSET_NOT_PROVIDED')).toBe(false)
  })

  it('伴侶資產只有 household 範圍才納入家庭退休', async () => {
    const input = fixture()
    input.assets.push({
      ...input.assets[0], id: 'asset-b', name: 'B 資產', ownerMemberId: 'b', currentValueTwd: '1000000', retirementUsageScope: 'household',
    })
    const household = await calculateRetirement(input)
    expect(household.includedDataSummary.assetIds).toContain('asset-b')

    input.assets[1].retirementUsageScope = 'personal'
    const personal = await calculateRetirement(input)
    expect(personal.includedDataSummary.assetIds).not.toContain('asset-b')
    expect(personal.retirementAssetsAtRetirement).not.toBe(household.retirementAssetsAtRetirement)
  })

  it('共同資產在家庭檢視只計一次', async () => {
    const input = fixture()
    input.assets = [{
      ...input.assets[0], id: 'joint', name: '共同資產', ownershipType: 'joint', ownerMemberId: undefined,
      owners: [{ memberId: 'a', share: '0.5' }, { memberId: 'b', share: '0.5' }], retirementUsageScope: 'household',
    }]
    input.retirementPlan.retirementExpenseMonthlyRealTwd = '0'
    const result = await calculateRetirement(input)
    expect(result.retirementAssetsAtRetirement).toBe('1200000.00')
  })

  it('主要規劃人的 ownerRetirement 投入從候選退休月份停止', async () => {
    const input = fixture()
    input.contributions = [{
      id: 'contribution-a', householdId: 'household-1', sourceMemberId: 'a', amountTwd: '30000', usageScope: 'household',
      startDate: '2025-01', endRule: 'ownerRetirement', destinationAssetId: 'asset-a', status: 'provided',
    }]
    const result = await calculateRetirement(input)
    expect(result.monthlyTimeline[0].contributions).toBe('0.00')
  })

  it('月底投入當月不產生報酬，下一月才計息', async () => {
    const input = fixture()
    input.assets[0].currentValueTwd = '0'
    input.assumptions.returnProfiles = [{ id: 'six', name: '6%', annualReturnRate: '0.06' }]
    input.retirementPlan.defaultReturnProfileId = 'six'
    input.retirementPlan.retirementExpenseMonthlyRealTwd = '0'
    input.assets[0].returnProfileId = 'six'
    input.contributions = [{
      id: 'contribution-a', householdId: 'household-1', sourceMemberId: 'a', amountTwd: '1000', usageScope: 'household',
      startDate: '2026-01', endRule: 'planEnd', destinationAssetId: 'asset-a', status: 'provided',
    }]
    const result = await calculateRetirement(input)
    expect(result.monthlyTimeline[0].investmentReturn).toBe('0.00')
    expect(new Decimal(result.monthlyTimeline[1].investmentReturn).gt(0)).toBe(true)
  })

  it('規劃期間內無法支應時回傳不可達', async () => {
    const input = fixture()
    input.assets[0].currentValueTwd = '100'
    const result = await calculateRetirement(input)
    expect(result.status).toBe('notAchievableWithinHorizon')
    expect(result.earliestRetirementMonth).toBeNull()
  })

  it('相同輸入產生相同 hash 與結果', async () => {
    const first = await calculateRetirement(fixture())
    const second = await calculateRetirement(fixture())
    expect(first.inputHash).toBe(second.inputHash)
    expect(first.earliestRetirementMonth).toBe(second.earliestRetirementMonth)
    expect(first.monthlyTimeline).toEqual(second.monthlyTimeline)
  })

  it('伴侶 ownerRetirement 投入缺少退休月份時回傳錯誤', async () => {
    const input = fixture()
    input.members[1].plannedRetirementMonth = undefined
    input.contributions = [{
      id: 'contribution-b', householdId: 'household-1', sourceMemberId: 'b', amountTwd: '10000', usageScope: 'household',
      startDate: '2026-01', endRule: 'ownerRetirement', destinationAssetId: 'asset-a', status: 'provided',
    }]
    const result = await calculateRetirement(input)
    expect(result.status).toBe('error')
    expect(result.errors.some((error) => error.code === 'OWNER_RETIREMENT_MONTH_MISSING')).toBe(true)
  })

  it('投入目的資產被排除時回傳錯誤', async () => {
    const input = fixture()
    input.assets[0].retirementUsageScope = 'excluded'
    input.contributions = [{
      id: 'contribution-a', householdId: 'household-1', sourceMemberId: 'a', amountTwd: '10000', usageScope: 'household',
      startDate: '2026-01', endRule: 'planEnd', destinationAssetId: 'asset-a', status: 'provided',
    }]
    const result = await calculateRetirement(input)
    expect(result.status).toBe('error')
    expect(result.errors.some((error) => error.code === 'CONTRIBUTION_DESTINATION_EXCLUDED')).toBe(true)
  })

  it('不支援的規則版本會阻止計算', async () => {
    const input = fixture()
    input.ruleVersion = 'unknown-rules'
    const result = await calculateRetirement(input)
    expect(result.status).toBe('error')
    expect(result.errors.some((error) => error.code === 'UNSUPPORTED_RULE_VERSION')).toBe(true)
  })

  it('沒有有效資產或資產為負數時會阻止計算', async () => {
    const missing = fixture()
    missing.assets = []
    const missingResult = await calculateRetirement(missing)
    expect(missingResult.errors.some((error) => error.code === 'RETIREMENT_ASSET_MISSING')).toBe(true)

    const negative = fixture()
    negative.assets[0].currentValueTwd = '-1'
    const negativeResult = await calculateRetirement(negative)
    expect(negativeResult.errors.some((error) => error.code === 'NEGATIVE_AMOUNT')).toBe(true)
  })
})
