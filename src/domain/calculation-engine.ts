import Decimal from 'decimal.js'
import { sha256 } from './canonical'
import { addMonths, isMonthBetween, monthIndex, monthsBetween, toMonth } from './date'
import type {
  Asset,
  CalculationInput,
  CalculationMessage,
  CalculationResult,
  Contribution,
  ExcludedDataSummary,
  MonthlyTimelineItem,
} from './models'

interface AssetBucket {
  id: string
  balance: Decimal
  initialValue: Decimal
  availableMonth: string
  activated: boolean
  monthlyReturnRate: Decimal
}

interface SimulationResult {
  success: boolean
  retirementAssets: Decimal
  endingAssetsNominal: Decimal
  endingAssetsReal: Decimal
  timeline: MonthlyTimelineItem[]
}

interface SimulationContext {
  inflationFactors: Map<string, Decimal>
  oneTimeExpenses: Map<string, Decimal>
  monthlyReturnRates: Map<string, Decimal>
}

const ZERO = new Decimal(0)

function money(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
}

function monthlyRate(annualRate: string): Decimal {
  return new Decimal(1).plus(annualRate).pow(new Decimal(1).div(12)).minus(1)
}

function validateInput(input: CalculationInput): CalculationMessage[] {
  const errors: CalculationMessage[] = []
  const primary = input.members.find((member) => member.id === input.household.primaryMemberId)
  if (!primary) errors.push({ code: 'PRIMARY_MEMBER_MISSING', message: '找不到主要規劃人。' })
  if (input.contractVersion !== 'calculation-contract-v0.1') {
    errors.push({ code: 'UNSUPPORTED_CONTRACT', message: '不支援此計算契約版本。' })
  }
  if (input.ruleVersion !== 'rules-none-v0.1') {
    errors.push({ code: 'UNSUPPORTED_RULE_VERSION', message: '不支援此規則版本。' })
  }
  if (!input.assets.some((asset) => asset.status === 'provided')) {
    errors.push({ code: 'RETIREMENT_ASSET_MISSING', message: '至少需要一筆有效退休資產，明確的 0 元資產也可以。' })
  }
  try {
    toMonth(input.calculationBaseDate)
    toMonth(input.retirementPlan.earliestRetirementMonth)
    if (primary) {
      toMonth(primary.birthDate)
      const planEnd = addMonths(primary.birthDate, primary.planningEndAge * 12)
      if (monthIndex(planEnd) < monthIndex(input.retirementPlan.earliestRetirementMonth)) {
        errors.push({ code: 'INVALID_HORIZON', message: '規劃終點早於最早允許退休月份。' })
      }
      if (monthIndex(primary.birthDate) > monthIndex(input.calculationBaseDate)) {
        errors.push({ code: 'BIRTH_DATE_IN_FUTURE', message: '出生日期不可晚於計算基準日。' })
      }
    }
  } catch (error) {
    errors.push({ code: 'INVALID_DATE', message: error instanceof Error ? error.message : '日期格式無效。' })
  }

  const decimalFields = [
    input.retirementPlan.retirementExpenseMonthlyRealTwd,
    input.retirementPlan.safetyReserveRealTwd,
    input.retirementPlan.legacyTargetRealTwd,
    input.assumptions.annualInflationRate,
    ...input.assets.filter((asset) => asset.status === 'provided').map((asset) => asset.currentValueTwd),
    ...input.contributions
      .filter((contribution) => contribution.status === 'provided')
      .map((contribution) => contribution.amountTwd),
    ...input.assumptions.returnProfiles.map((profile) => profile.annualReturnRate),
    ...input.retirementPlan.oneTimeExpenses.map((expense) => expense.amountTwdReal),
  ]
  try {
    if (decimalFields.some((value) => !new Decimal(value).isFinite())) {
      errors.push({ code: 'INVALID_NUMBER', message: '金額或利率格式無效。' })
    }
  } catch {
    errors.push({ code: 'INVALID_NUMBER', message: '金額或利率格式無效。' })
  }
  if (errors.some((error) => error.code === 'INVALID_NUMBER')) return errors
  const nonNegativeAmounts = [
    input.retirementPlan.retirementExpenseMonthlyRealTwd,
    input.retirementPlan.safetyReserveRealTwd,
    input.retirementPlan.legacyTargetRealTwd,
    ...input.assets.filter((asset) => asset.status === 'provided').map((asset) => asset.currentValueTwd),
    ...input.contributions.filter((item) => item.status === 'provided').map((item) => item.amountTwd),
    ...input.retirementPlan.oneTimeExpenses.map((expense) => expense.amountTwdReal),
  ]
  if (nonNegativeAmounts.some((value) => new Decimal(value).lt(0))) {
    errors.push({ code: 'NEGATIVE_AMOUNT', message: '資產、投入與支出金額不可為負數。' })
  }
  if (new Decimal(input.assumptions.annualInflationRate).lte(-1)) {
    errors.push({ code: 'INVALID_INFLATION', message: '通膨率必須大於 -100%。' })
  }
  for (const profile of input.assumptions.returnProfiles) {
    const rate = new Decimal(profile.annualReturnRate)
    if (rate.lte(-1) || rate.gt(1)) {
      errors.push({ code: 'INVALID_RETURN_RATE', message: `${profile.name} 的年化報酬率必須介於 -99% 與 100%。`, entityId: profile.id })
    }
  }
  for (const asset of input.assets) {
    if (asset.ownershipType === 'joint') {
      const totalShare = (asset.owners ?? []).reduce((sum, owner) => sum.plus(owner.share), ZERO)
      if (totalShare.gt(1)) {
        errors.push({ code: 'INVALID_OWNERSHIP_SHARE', message: `${asset.name} 的共同持分超過 100%。`, entityId: asset.id })
      }
    }
  }
  for (const contribution of input.contributions.filter((item) => item.status === 'provided')) {
    if (!contribution.destinationAssetId && !contribution.returnProfileId) {
      errors.push({ code: 'CONTRIBUTION_DESTINATION_MISSING', message: '每月投入必須指定資產或報酬設定檔。', entityId: contribution.id })
    }
    if (contribution.endRule === 'fixedDate' && !contribution.endDate) {
      errors.push({ code: 'CONTRIBUTION_END_DATE_MISSING', message: '固定日期停止的投入必須提供結束日期。', entityId: contribution.id })
    }
    const owner = input.members.find((member) => member.id === contribution.sourceMemberId)
    if (contribution.endRule === 'ownerRetirement' && owner?.id !== input.household.primaryMemberId && !owner?.plannedRetirementMonth) {
      errors.push({ code: 'OWNER_RETIREMENT_MONTH_MISSING', message: '伴侶投入使用本人退休停止時，必須提供伴侶退休月份。', entityId: contribution.id })
    }
    if (contribution.destinationAssetId) {
      const destination = input.assets.find((asset) => asset.id === contribution.destinationAssetId)
      if (!destination || !includeAsset(destination, input.household.primaryMemberId).included) {
        errors.push({ code: 'CONTRIBUTION_DESTINATION_EXCLUDED', message: '每月投入的目的資產必須納入本次退休計算。', entityId: contribution.id })
      }
    }
  }
  return errors
}

function warningsFor(input: CalculationInput): CalculationMessage[] {
  const warnings: CalculationMessage[] = [
    { code: 'FIXED_RETURN_ASSUMPTION', message: '目前使用固定報酬率，尚未納入隨機市場波動。' },
    { code: 'TAX_AND_FEES_EXCLUDED', message: '本次尚未納入稅務與交易成本。' },
  ]
  const partner = input.members.find((member) => member.role === 'partner')
  if (partner) {
    warnings.push({
      code: 'PARTNER_OPTIONAL_DATA_MISSING',
      message: `${partner.name} 的收入、負債、勞保與勞退若未提供，將不納入本次計算。`,
      entityId: partner.id,
    })
  }
  for (const asset of input.assets.filter((item) => item.status === 'notProvided')) {
    warnings.push({ code: 'ASSET_NOT_PROVIDED', message: `${asset.name} 尚未提供，不納入計算。`, entityId: asset.id })
  }
  return warnings
}

function includeAsset(asset: Asset, primaryMemberId: string): { included: boolean; reason?: string } {
  if (asset.status !== 'provided') return { included: false, reason: asset.status === 'notApplicable' ? '不適用' : '尚未提供' }
  if (asset.retirementUsageScope === 'excluded') return { included: false, reason: '已排除退休用途' }
  if (asset.ownershipType === 'household' || asset.ownershipType === 'joint') {
    return asset.retirementUsageScope === 'household'
      ? { included: true }
      : { included: false, reason: '未標記為家庭退休可用' }
  }
  if (asset.ownerMemberId === primaryMemberId) return { included: true }
  return asset.retirementUsageScope === 'household'
    ? { included: true }
    : { included: false, reason: '伴侶個人資產' }
}

function includeContribution(contribution: Contribution, primaryMemberId: string): { included: boolean; reason?: string } {
  if (contribution.status !== 'provided') return { included: false, reason: contribution.status === 'notApplicable' ? '不適用' : '尚未提供' }
  if (contribution.sourceMemberId === primaryMemberId || contribution.usageScope === 'household') return { included: true }
  return { included: false, reason: '伴侶個人投入' }
}

function contributionIsActive(
  contribution: Contribution,
  month: string,
  candidateRetirementMonth: string,
  input: CalculationInput,
  planEndMonth: string,
): boolean {
  const start = toMonth(contribution.startDate)
  let end = planEndMonth
  if (contribution.endRule === 'fixedDate' && contribution.endDate) end = toMonth(contribution.endDate)
  if (contribution.endRule === 'primaryRetirement') end = addMonths(candidateRetirementMonth, -1)
  if (contribution.endRule === 'ownerRetirement') {
    const owner = input.members.find((member) => member.id === contribution.sourceMemberId)
    const retirementMonth = owner?.id === input.household.primaryMemberId
      ? candidateRetirementMonth
      : owner?.plannedRetirementMonth
    if (retirementMonth) end = addMonths(retirementMonth, -1)
  }
  return isMonthBetween(month, start, end)
}

function withdrawProportionally(buckets: AssetBucket[], amount: Decimal): boolean {
  if (amount.eq(0)) return true
  const active = buckets.filter((bucket) => bucket.activated && bucket.balance.gt(0))
  const total = active.reduce((sum, bucket) => sum.plus(bucket.balance), ZERO)
  if (total.lt(amount)) return false
  let remaining = amount
  active.forEach((bucket, index) => {
    const withdrawal = index === active.length - 1
      ? remaining
      : amount.mul(bucket.balance.div(total))
    bucket.balance = bucket.balance.minus(withdrawal)
    remaining = remaining.minus(withdrawal)
  })
  return true
}

function sumBalances(buckets: AssetBucket[]): Decimal {
  return buckets.reduce((sum, bucket) => sum.plus(bucket.activated ? bucket.balance : ZERO), ZERO)
}

function createBuckets(input: CalculationInput, includedAssets: Asset[], context: SimulationContext): AssetBucket[] {
  const profiles = new Map(input.assumptions.returnProfiles.map((profile) => [profile.id, profile]))
  const defaultProfile = profiles.get(input.retirementPlan.defaultReturnProfileId)
  if (!defaultProfile) throw new Error('找不到預設報酬設定檔。')
  return includedAssets.map((asset) => {
    const profile = profiles.get(asset.returnProfileId ?? defaultProfile.id) ?? defaultProfile
    return {
      id: asset.id,
      balance: ZERO,
      initialValue: new Decimal(asset.currentValueTwd),
      availableMonth: toMonth(asset.availableFrom),
      activated: false,
      monthlyReturnRate: context.monthlyReturnRates.get(profile.id) ?? monthlyRate(profile.annualReturnRate),
    }
  })
}

function simulate(
  input: CalculationInput,
  candidateRetirementMonth: string,
  planEndMonth: string,
  includedAssets: Asset[],
  includedContributions: Contribution[],
  context: SimulationContext,
): SimulationResult {
  const buckets = createBuckets(input, includedAssets, context)
  const profiles = new Map(input.assumptions.returnProfiles.map((profile) => [profile.id, profile]))
  const baseMonth = toMonth(input.calculationBaseDate)
  const timeline: MonthlyTimelineItem[] = []
  let retirementAssets = ZERO
  let failed = false

  for (let cursor = monthIndex(baseMonth); cursor <= monthIndex(planEndMonth); cursor += 1) {
    const month = addMonths(baseMonth, cursor - monthIndex(baseMonth))
    const openingAssets = sumBalances(buckets)
    let activatedAssets = ZERO
    for (const bucket of buckets) {
      if (!bucket.activated && monthIndex(month) >= monthIndex(bucket.availableMonth)) {
        bucket.activated = true
        bucket.balance = bucket.balance.plus(bucket.initialValue)
        activatedAssets = activatedAssets.plus(bucket.initialValue)
      }
    }
    if (month === candidateRetirementMonth) retirementAssets = sumBalances(buckets)

    const inflationFactor = context.inflationFactors.get(month) ?? new Decimal(1)
    const retirementExpense = monthIndex(month) >= monthIndex(candidateRetirementMonth)
      ? new Decimal(input.retirementPlan.retirementExpenseMonthlyRealTwd).mul(inflationFactor)
      : ZERO
    const oneTimeExpenses = context.oneTimeExpenses.get(month) ?? ZERO
    const totalWithdrawal = retirementExpense.plus(oneTimeExpenses)
    if (!withdrawProportionally(buckets, totalWithdrawal)) failed = true

    let investmentReturn = ZERO
    if (!failed) {
      for (const bucket of buckets.filter((item) => item.activated)) {
        const gain = bucket.balance.mul(bucket.monthlyReturnRate)
        bucket.balance = bucket.balance.plus(gain)
        investmentReturn = investmentReturn.plus(gain)
      }
    }

    let contributionTotal = ZERO
    if (!failed) {
      for (const contribution of includedContributions) {
        if (!contributionIsActive(contribution, month, candidateRetirementMonth, input, planEndMonth)) continue
        const amount = new Decimal(contribution.amountTwd)
        let bucket = contribution.destinationAssetId
          ? buckets.find((item) => item.id === contribution.destinationAssetId)
          : buckets.find((item) => item.id === `contribution:${contribution.id}`)
        if (!bucket && contribution.returnProfileId) {
          const profile = profiles.get(contribution.returnProfileId)
          if (!profile) throw new Error(`找不到投入 ${contribution.id} 的報酬設定檔。`)
          bucket = {
            id: `contribution:${contribution.id}`,
            balance: ZERO,
            initialValue: ZERO,
            availableMonth: baseMonth,
            activated: true,
            monthlyReturnRate: context.monthlyReturnRates.get(profile.id) ?? monthlyRate(profile.annualReturnRate),
          }
          buckets.push(bucket)
        }
        if (!bucket) throw new Error(`找不到投入 ${contribution.id} 的目的資產。`)
        bucket.activated = true
        bucket.balance = bucket.balance.plus(amount)
        contributionTotal = contributionTotal.plus(amount)
      }
    }

    const closingAssets = failed ? ZERO : sumBalances(buckets)
    const realFactor = inflationFactor
    timeline.push({
      month,
      openingAssets: money(openingAssets),
      activatedAssets: money(activatedAssets),
      externalInflows: money(ZERO),
      retirementExpenses: money(retirementExpense),
      oneTimeExpenses: money(oneTimeExpenses),
      investmentReturn: money(investmentReturn),
      contributions: money(contributionTotal),
      closingAssets: money(closingAssets),
      closingAssetsReal: money(closingAssets.div(realFactor)),
    })
    if (failed) break
  }

  const endingAssetsNominal = failed ? ZERO : sumBalances(buckets)
  const endingInflationFactor = context.inflationFactors.get(planEndMonth) ?? new Decimal(1)
  const endingAssetsReal = endingAssetsNominal.div(endingInflationFactor)
  const requiredEndingAssets = new Decimal(input.retirementPlan.safetyReserveRealTwd)
    .plus(input.retirementPlan.legacyTargetRealTwd)
  return {
    success: !failed && endingAssetsReal.gte(requiredEndingAssets),
    retirementAssets,
    endingAssetsNominal,
    endingAssetsReal,
    timeline,
  }
}

export async function calculateRetirement(input: CalculationInput): Promise<CalculationResult> {
  const errors = validateInput(input)
  const inputHash = await sha256(input)
  const primary = input.members.find((member) => member.id === input.household.primaryMemberId)
  const excludedDataSummary: ExcludedDataSummary = { assets: [], contributions: [] }
  const includedAssets = input.assets.filter((asset) => {
    const result = includeAsset(asset, input.household.primaryMemberId)
    if (!result.included) excludedDataSummary.assets.push({ id: asset.id, reason: result.reason ?? '未納入' })
    return result.included
  })
  const includedContributions = input.contributions.filter((contribution) => {
    const result = includeContribution(contribution, input.household.primaryMemberId)
    if (!result.included) excludedDataSummary.contributions.push({ id: contribution.id, reason: result.reason ?? '未納入' })
    return result.included
  })
  const baseResult = {
    calculationId: input.calculationId,
    contractVersion: input.contractVersion,
    ruleVersion: input.ruleVersion,
    calculationBaseDate: input.calculationBaseDate,
    inputHash,
    warnings: warningsFor(input),
    errors,
    includedDataSummary: {
      assetIds: includedAssets.map((asset) => asset.id),
      contributionIds: includedContributions.map((contribution) => contribution.id),
    },
    excludedDataSummary,
  }
  if (errors.length > 0 || !primary) {
    return {
      ...baseResult,
      status: 'error',
      earliestRetirementMonth: null,
      retirementAgeInMonths: null,
      retirementAssetsAtRetirement: null,
      endingAssetsNominal: null,
      endingAssetsReal: null,
      monthlyTimeline: [],
    }
  }

  const planEndMonth = addMonths(primary.birthDate, primary.planningEndAge * 12)
  const earliestMonth = toMonth(input.retirementPlan.earliestRetirementMonth)
  const baseMonth = toMonth(input.calculationBaseDate)
  const inflationRate = new Decimal(input.assumptions.annualInflationRate)
  const inflationFactors = new Map<string, Decimal>()
  for (let cursor = monthIndex(baseMonth); cursor <= monthIndex(planEndMonth); cursor += 1) {
    const month = addMonths(baseMonth, cursor - monthIndex(baseMonth))
    const offset = monthsBetween(baseMonth, month)
    inflationFactors.set(month, new Decimal(1).plus(inflationRate).pow(new Decimal(offset).div(12)))
  }
  const oneTimeExpenses = new Map<string, Decimal>()
  for (const expense of input.retirementPlan.oneTimeExpenses) {
    const month = toMonth(expense.month)
    const nominalAmount = new Decimal(expense.amountTwdReal).mul(inflationFactors.get(month) ?? 1)
    oneTimeExpenses.set(month, (oneTimeExpenses.get(month) ?? ZERO).plus(nominalAmount))
  }
  const context: SimulationContext = {
    inflationFactors,
    oneTimeExpenses,
    monthlyReturnRates: new Map(input.assumptions.returnProfiles.map((profile) => [profile.id, monthlyRate(profile.annualReturnRate)])),
  }
  let lastSimulation: SimulationResult | null = null
  for (let cursor = monthIndex(earliestMonth); cursor <= monthIndex(planEndMonth); cursor += 1) {
    const candidate = addMonths(earliestMonth, cursor - monthIndex(earliestMonth))
    try {
      const simulation = simulate(input, candidate, planEndMonth, includedAssets, includedContributions, context)
      lastSimulation = simulation
      if (simulation.success) {
        return {
          ...baseResult,
          status: 'success',
          earliestRetirementMonth: candidate,
          retirementAgeInMonths: monthsBetween(primary.birthDate, candidate),
          retirementAssetsAtRetirement: money(simulation.retirementAssets),
          endingAssetsNominal: money(simulation.endingAssetsNominal),
          endingAssetsReal: money(simulation.endingAssetsReal),
          monthlyTimeline: simulation.timeline,
        }
      }
    } catch (error) {
      return {
        ...baseResult,
        status: 'error',
        earliestRetirementMonth: null,
        retirementAgeInMonths: null,
        retirementAssetsAtRetirement: null,
        endingAssetsNominal: null,
        endingAssetsReal: null,
        monthlyTimeline: [],
        errors: [...errors, { code: 'CALCULATION_FAILED', message: error instanceof Error ? error.message : '計算失敗。' }],
      }
    }
  }

  return {
    ...baseResult,
    status: 'notAchievableWithinHorizon',
    earliestRetirementMonth: null,
    retirementAgeInMonths: null,
    retirementAssetsAtRetirement: null,
    endingAssetsNominal: lastSimulation ? money(lastSimulation.endingAssetsNominal) : null,
    endingAssetsReal: lastSimulation ? money(lastSimulation.endingAssetsReal) : null,
    monthlyTimeline: lastSimulation?.timeline ?? [],
  }
}
