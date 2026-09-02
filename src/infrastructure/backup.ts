import { z } from 'zod'
import { migratePlannerData } from '../application/planner-migration'
import { validatePlannerData } from '../application/planner-service'
import type { PlannerData } from '../application/planner-data'

const timestamp = { createdAt: z.string(), updatedAt: z.string() }
const memberSchema = z.object({ id: z.string(), householdId: z.string(), name: z.string(), role: z.enum(['primary', 'partner', 'other']), birthDate: z.string(), planningEndAge: z.number(), plannedRetirementMonth: z.string().optional(), isActive: z.boolean(), ...timestamp })
const assetBase = { id: z.string(), householdId: z.string(), name: z.string(), assetType: z.enum(['cash', 'stockEtf', 'other']), ownershipType: z.enum(['individual', 'joint', 'household']), ownerMemberId: z.string().optional(), owners: z.array(z.object({ memberId: z.string(), share: z.string() })).optional(), includeInTotalAssets: z.boolean(), retirementUsageScope: z.enum(['personal', 'household', 'excluded']), availableFrom: z.string(), returnProfileId: z.string().optional(), status: z.enum(['provided', 'notProvided', 'notApplicable']) }
const contributionBase = { id: z.string(), householdId: z.string(), sourceMemberId: z.string(), usageScope: z.enum(['personal', 'household']), startDate: z.string(), endRule: z.enum(['ownerRetirement', 'primaryRetirement', 'fixedDate', 'planEnd']), endDate: z.string().optional(), destinationAssetId: z.string().optional(), returnProfileId: z.string().optional(), status: z.enum(['provided', 'notProvided', 'notApplicable']) }
const common = {
  calculationBaseDate: z.string(),
  retirementPlan: z.object({ earliestRetirementMonth: z.string(), retirementExpenseMonthlyRealTwd: z.string(), safetyReserveRealTwd: z.string(), legacyTargetRealTwd: z.string(), defaultReturnProfileId: z.string(), oneTimeExpenses: z.array(z.object({ id: z.string(), name: z.string(), month: z.string(), amountTwdReal: z.string() })) }),
  assumptions: z.object({ annualInflationRate: z.string(), returnProfiles: z.array(z.object({ id: z.string(), name: z.string(), annualReturnRate: z.string() })) }),
  updatedAt: z.string(),
}
const v01DataSchema = z.object({ schemaVersion: z.literal('planner-data-v0.1'), ...common, household: z.object({ id: z.string(), name: z.string(), baseCurrency: z.literal('TWD'), primaryMemberId: z.string() }), members: z.array(memberSchema.omit({ createdAt: true, updatedAt: true })), assets: z.array(z.object({ ...assetBase, currentValueTwd: z.string() })), contributions: z.array(z.object({ ...contributionBase, amountTwd: z.string() })) })
const v02DataSchema = z.object({ schemaVersion: z.literal('planner-data-v0.2'), ...common, household: z.object({ id: z.string(), name: z.string(), baseCurrency: z.literal('TWD'), primaryMemberId: z.string(), ...timestamp }), members: z.array(memberSchema), assets: z.array(z.object({ ...assetBase, currentValue: z.object({ amount: z.string(), currency: z.string().regex(/^[A-Z]{3}$/) }), ...timestamp })), contributions: z.array(z.object({ ...contributionBase, amount: z.object({ amount: z.string(), currency: z.string().regex(/^[A-Z]{3}$/) }), ...timestamp })), ruleVersion: z.literal('rules-none-v0.1'), retirementMode: z.literal('support-to-plan-end-v0.1') })

export function serializeBackup(data: PlannerData): string {
  return JSON.stringify({ backupVersion: 'retirement-planner-backup-v0.2', exportedAt: new Date().toISOString(), data }, null, 2)
}

export function parseBackup(value: string): PlannerData {
  const parsed = JSON.parse(value) as { backupVersion?: string; data?: unknown }
  if (parsed.backupVersion !== 'retirement-planner-backup-v0.1' && parsed.backupVersion !== 'retirement-planner-backup-v0.2') throw new Error('UNSUPPORTED_BACKUP_VERSION')
  const source = parsed.backupVersion === 'retirement-planner-backup-v0.1' ? v01DataSchema.parse(parsed.data) : v02DataSchema.parse(parsed.data)
  const migrated = migratePlannerData(source)
  validatePlannerData(migrated)
  return migrated
}

export function downloadBackup(data: PlannerData): void {
  const blob = new Blob([serializeBackup(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `退休規劃備份_${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
