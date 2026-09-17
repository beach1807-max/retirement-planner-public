export const BASE_SCENARIO_OPTIONS = [
  ['conservative', '保守'],
  ['balanced', '穩健'],
  ['optimistic', '比較樂觀'],
] as const

export const BASE_SCENARIO_LABELS = Object.fromEntries(BASE_SCENARIO_OPTIONS) as Record<(typeof BASE_SCENARIO_OPTIONS)[number][0], string>

export const PROJECTION_SCENARIO_LABELS = {
  ...BASE_SCENARIO_LABELS,
  custom: '自訂',
} as const

export const UI_TERMS = {
  calculationBaseDate: '計算基準日',
  laborPensionClaimMethod: '勞退請領方式',
  retirementNeedsPlanning: '退休生活需求試算',
  retirementNeedsUsageScope: '退休生活需求試算使用範圍',
} as const
