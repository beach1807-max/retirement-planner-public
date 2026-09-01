import type { PlannerData } from '../application/planner-data'

export interface PlannerRepository {
  load(): Promise<PlannerData | null>
  save(data: PlannerData): Promise<void>
  clear(): Promise<void>
}

