import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Onboarding } from './Onboarding'
import { SettingsPage } from './SettingsPage'
import { DataPage } from './DataPage'
import { createDemoData } from '../application/planner-data'
import { PlannerService, validatePlannerData } from '../application/planner-service'

describe('新手資料流程', () => {
  afterEach(cleanup)
  it('儲存資產時保留收合欄位與未設定報酬', async () => {
    const data = createDemoData('2026-09-01')
    const asset = data.assets[0]
    asset.returnProfileId = undefined
    asset.region = 'global'
    asset.riskLevel = 'high'
    asset.availableFrom = '2030-01-01'
    asset.includeInTotalAssets = false
    const service = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })
    const change = vi.fn()
    render(<DataPage data={data} summary={service.dashboard(data, 'household')} onChange={change} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: `編輯 ${asset.name}` }))
    await user.click(screen.getByRole('button', { name: '儲存資產' }))
    expect(change).toHaveBeenCalledOnce()
    const saved = change.mock.calls[0][0].assets[0]
    expect(saved).toMatchObject({ ...asset, updatedAt: saved.updatedAt })
    expect(await service.project(change.mock.calls[0][0])).toEqual(await service.project(data))
  })
  it('只填姓名與生日即可建立有效資料並產生預測', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    render(<Onboarding onCreate={create} onLoadDemo={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '建立完整退休規劃' }))
    await user.type(screen.getByLabelText('主要規劃人名稱'), '小林')
    await user.type(screen.getByLabelText('出生日期'), '1990-01-01')
    await user.click(screen.getByRole('button', { name: /開始建立/ }))
    expect(create).toHaveBeenCalledOnce()
    const data = create.mock.calls[0][0]
    expect(data.members[0].plannedRetirementMonth).toBeUndefined()
    expect(() => validatePlannerData(data)).not.toThrow()
    const service = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })
    expect((await service.project(data)).scenarios).toHaveLength(3)
  })

  it('儲存一般設定仍保留收合的舊版資料與相同預測結果', async () => {
    const data = createDemoData('2026-09-01')
    data.retirementPlan.oneTimeExpenses = [{ id: 'repair', name: '修繕', month: '2040-01', amountTwdReal: '123456' }]
    const changed = vi.fn()
    render(<SettingsPage data={data} onChange={changed} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '儲存設定' }))
    expect(changed).toHaveBeenCalledOnce()
    const saved = changed.mock.calls[0][0]
    expect(saved.retirementPlan).toEqual(data.retirementPlan)
    const service = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })
    expect(await service.project(saved)).toEqual(await service.project(data))
  })

  it('尚未選取投資組合時，不自動把已分類資產加入本金', async () => {
    const data = createDemoData('2026-09-01')
    data.portfolios = []
    data.contributions = []
    data.retirementSystems = []
    const service = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })
    const result = await service.project(data)
    expect(result.scenarios.every((scenario) => scenario.milestones.every((item) => Number(item.investmentAssetsNominal) === 0))).toBe(true)
    expect(Number(service.dashboard(data, 'household').totalAssetsTwd)).toBeGreaterThan(0)
  })
})
