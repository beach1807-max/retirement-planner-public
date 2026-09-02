import { describe, expect, it } from 'vitest'
import { createDemoData } from './planner-data'
import { PlannerService } from './planner-service'
import { applyScenario, ScenarioService } from './scenario-service'

const planner = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })

describe('Scenario Service', () => {
  it('套用與執行情境不修改正式資料，且相同輸入產生相同 hash', async () => {
    const data = createDemoData('2026-09-01')
    const before = JSON.stringify(data)
    const scenario = data.scenarios[1]
    expect(applyScenario(data, scenario).contributions).toHaveLength(data.contributions.length + 1)
    const service = new ScenarioService(planner)
    const first = await service.run(data, scenario)
    const second = await service.run(data, scenario)
    expect(JSON.stringify(data)).toBe(before)
    expect(first.inputHash).toBe(second.inputHash)
  })

  it('勞退資料不足時不猜測自提 6% 結果', async () => {
    const data = createDemoData('2026-09-01')
    data.retirementSystems = []
    const result = await new ScenarioService(planner).run(data, data.scenarios[2])
    expect(result.status).toBe('unavailable')
    expect(result.warnings[0]).toContain('需先提供')
  })
})
