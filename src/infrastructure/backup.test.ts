import { describe, expect, it } from 'vitest'
import { createDemoData } from '../application/planner-data'
import { calculateRetirement } from '../domain/calculation-engine'
import { parseBackup, serializeBackup } from './backup'

describe('JSON 備份', () => {
  it('匯出後可還原相同資料', () => {
    const original = createDemoData('2026-09-01')
    expect(parseBackup(serializeBackup(original))).toEqual(original)
  })

  it('拒絕不支援的備份版本', () => {
    expect(() => parseBackup('{"backupVersion":"unknown","data":{}}')).toThrow()
  })

  it('還原後可產生相同計算結果', async () => {
    const original = createDemoData('2026-09-01')
    const restored = parseBackup(serializeBackup(original))
    const toInput = (data: typeof original) => ({
      contractVersion: 'calculation-contract-v0.1' as const,
      calculationId: 'backup-verification',
      calculationBaseDate: data.calculationBaseDate,
      household: data.household,
      members: data.members,
      assets: data.assets,
      contributions: data.contributions,
      retirementPlan: data.retirementPlan,
      assumptions: data.assumptions,
      ruleVersion: 'rules-none-v0.1',
    })
    expect(await calculateRetirement(toInput(restored))).toEqual(await calculateRetirement(toInput(original)))
  })
})
