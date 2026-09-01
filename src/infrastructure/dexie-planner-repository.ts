import Dexie, { type EntityTable } from 'dexie'
import type { PlannerData } from '../application/planner-data'
import type { PlannerRepository } from './planner-repository'

interface PlannerRecord {
  id: 'current'
  data: PlannerData
  updatedAt: string
}

class RetirementPlannerDatabase extends Dexie {
  planner!: EntityTable<PlannerRecord, 'id'>

  constructor() {
    super('retirement-planner-pwa')
    this.version(1).stores({ planner: 'id, updatedAt' })
  }
}

export class DexiePlannerRepository implements PlannerRepository {
  private readonly database = new RetirementPlannerDatabase()

  async load(): Promise<PlannerData | null> {
    return (await this.database.planner.get('current'))?.data ?? null
  }

  async save(data: PlannerData): Promise<void> {
    await this.database.planner.put({ id: 'current', data, updatedAt: data.updatedAt })
  }

  async clear(): Promise<void> {
    await this.database.planner.clear()
  }
}

