import Dexie, { type EntityTable } from 'dexie'
import type { PlannerData } from '../application/planner-data'
import { migratePlannerData } from '../application/planner-migration'
import type { PlannerRepository } from './planner-repository'

interface PlannerRecord {
  id: 'current'
  data: PlannerData
  updatedAt: string
}

export const APP_DATABASE_NAME = 'retirement-planner-public'

class RetirementPlannerDatabase extends Dexie {
  planner!: EntityTable<PlannerRecord, 'id'>

  constructor(databaseName = APP_DATABASE_NAME) {
    super(databaseName)
    this.version(1).stores({ planner: 'id, updatedAt' })
    this.version(2).stores({ planner: 'id, updatedAt' }).upgrade(async (transaction) => {
      await transaction.table('planner').toCollection().modify((record: PlannerRecord) => {
        record.data = migratePlannerData(record.data)
        record.updatedAt = record.data.updatedAt
      })
    })
    this.version(3).stores({ planner: 'id, updatedAt' }).upgrade(async (transaction) => {
      await transaction.table('planner').toCollection().modify((record: PlannerRecord) => {
        record.data = migratePlannerData(record.data)
        record.updatedAt = record.data.updatedAt
      })
    })
    this.version(4).stores({ planner: 'id, updatedAt' }).upgrade(async (transaction) => {
      await transaction.table('planner').toCollection().modify((record: PlannerRecord) => {
        record.data = migratePlannerData(record.data)
        record.updatedAt = record.data.updatedAt
      })
    })
    this.version(5).stores({ planner: 'id, updatedAt' }).upgrade(async (transaction) => {
      await transaction.table('planner').toCollection().modify((record: PlannerRecord) => {
        record.data = migratePlannerData(record.data)
        record.updatedAt = record.data.updatedAt
      })
    })
    this.version(6).stores({ planner: 'id, updatedAt' }).upgrade(async (transaction) => {
      await transaction.table('planner').toCollection().modify((record: PlannerRecord) => {
        record.data = migratePlannerData(record.data)
        record.updatedAt = record.data.updatedAt
      })
    })
    this.version(7).stores({ planner: 'id, updatedAt' }).upgrade(async (transaction) => {
      await transaction.table('planner').toCollection().modify((record: PlannerRecord) => {
        record.data = migratePlannerData(record.data)
        record.updatedAt = record.data.updatedAt
      })
    })
    this.version(8).stores({ planner: 'id, updatedAt' }).upgrade(async (transaction) => {
      await transaction.table('planner').toCollection().modify((record: PlannerRecord) => {
        record.data = migratePlannerData(record.data)
        record.updatedAt = record.data.updatedAt
      })
    })
  }
}

export class DexiePlannerRepository implements PlannerRepository {
  private readonly database: RetirementPlannerDatabase

  constructor(databaseName = APP_DATABASE_NAME) {
    this.database = new RetirementPlannerDatabase(databaseName)
  }

  async load(): Promise<PlannerData | unknown | null> {
    return (await this.database.planner.get('current'))?.data ?? null
  }

  async save(data: PlannerData): Promise<void> {
    await this.database.planner.put({ id: 'current', data, updatedAt: data.updatedAt })
  }

  async clear(): Promise<void> {
    await this.database.planner.clear()
  }
}
