import { fixedContributionEndMonth, toMonth } from '../domain/date'
import type { PlannerContribution, PlannerData } from './planner-data'

export function contributionEndMonth(data: PlannerData, item: PlannerContribution): string | undefined {
  if (item.endRule === 'fixedDate' && item.endDate) return fixedContributionEndMonth(item.endDate)
  const memberId = item.endRule === 'ownerRetirement' ? item.sourceMemberId : item.endRule === 'primaryRetirement' ? data.household.primaryMemberId : undefined
  return memberId ? data.members.find((member) => member.id === memberId)?.plannedRetirementMonth : undefined
}

export function contributionActiveInMonth(data: PlannerData, item: PlannerContribution, month: string): boolean {
  const end = contributionEndMonth(data, item)
  return item.status === 'provided' && month >= toMonth(item.startDate) && (!end || month < end)
}
