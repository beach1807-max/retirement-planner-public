import { describe, expect, it } from 'vitest'
import { createDemoData } from '../application/planner-data'
import { parseBackup, serializeBackup } from './backup'

describe('JSON 備份', () => {
  it('匯出後可還原相同資料', () => {
    const original = createDemoData('2026-09-01')
    expect(parseBackup(serializeBackup(original))).toEqual(original)
  })

  it('拒絕不支援的備份版本', () => {
    expect(() => parseBackup('{"backupVersion":"unknown","data":{}}')).toThrow()
  })
})

