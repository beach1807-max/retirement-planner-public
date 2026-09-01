import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoData } from '../application/planner-data'
import { DexiePlannerRepository } from './dexie-planner-repository'

describe('IndexedDB Repository', () => {
  const repository = new DexiePlannerRepository()

  beforeEach(async () => repository.clear())

  it('可儲存、重新讀取及清除規劃資料', async () => {
    const data = createDemoData('2026-09-01')
    await repository.save(data)
    expect(await repository.load()).toEqual(data)
    await repository.clear()
    expect(await repository.load()).toBeNull()
  })
})

