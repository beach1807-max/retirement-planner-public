import { z } from 'zod'
import type { PlannerData } from '../application/planner-data'

const backupSchema = z.object({
  backupVersion: z.literal('retirement-planner-backup-v0.1'),
  exportedAt: z.string(),
  data: z.object({
    schemaVersion: z.literal('planner-data-v0.1'),
    calculationBaseDate: z.string(),
    household: z.object({
      id: z.string(), name: z.string(), baseCurrency: z.literal('TWD'), primaryMemberId: z.string(),
    }),
    members: z.array(z.object({
      id: z.string(), householdId: z.string(), name: z.string(), role: z.enum(['primary', 'partner', 'other']),
      birthDate: z.string(), planningEndAge: z.number(), plannedRetirementMonth: z.string().optional(), isActive: z.boolean(),
    })),
    assets: z.array(z.object({
      id: z.string(), householdId: z.string(), name: z.string(), assetType: z.enum(['cash', 'stockEtf', 'other']),
      ownershipType: z.enum(['individual', 'joint', 'household']), ownerMemberId: z.string().optional(),
      owners: z.array(z.object({ memberId: z.string(), share: z.string() })).optional(), currentValueTwd: z.string(),
      includeInTotalAssets: z.boolean(), retirementUsageScope: z.enum(['personal', 'household', 'excluded']),
      availableFrom: z.string(), returnProfileId: z.string().optional(), status: z.enum(['provided', 'notProvided', 'notApplicable']),
    })),
    contributions: z.array(z.object({
      id: z.string(), householdId: z.string(), sourceMemberId: z.string(), amountTwd: z.string(),
      usageScope: z.enum(['personal', 'household']), startDate: z.string(),
      endRule: z.enum(['ownerRetirement', 'primaryRetirement', 'fixedDate', 'planEnd']), endDate: z.string().optional(),
      destinationAssetId: z.string().optional(), returnProfileId: z.string().optional(), status: z.enum(['provided', 'notProvided', 'notApplicable']),
    })),
    retirementPlan: z.object({
      earliestRetirementMonth: z.string(), retirementExpenseMonthlyRealTwd: z.string(), safetyReserveRealTwd: z.string(),
      legacyTargetRealTwd: z.string(), defaultReturnProfileId: z.string(),
      oneTimeExpenses: z.array(z.object({ id: z.string(), name: z.string(), month: z.string(), amountTwdReal: z.string() })),
    }),
    assumptions: z.object({
      annualInflationRate: z.string(),
      returnProfiles: z.array(z.object({ id: z.string(), name: z.string(), annualReturnRate: z.string() })),
    }),
    updatedAt: z.string(),
  }),
})

export function serializeBackup(data: PlannerData): string {
  return JSON.stringify({
    backupVersion: 'retirement-planner-backup-v0.1',
    exportedAt: new Date().toISOString(),
    data,
  }, null, 2)
}

export function parseBackup(value: string): PlannerData {
  return backupSchema.parse(JSON.parse(value)).data
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
