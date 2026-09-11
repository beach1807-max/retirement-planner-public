import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Onboarding } from './Onboarding'
import { SettingsPage } from './SettingsPage'
import { DataPage } from './DataPage'
import { createDemoData } from '../application/planner-data'
import { PlannerService, validatePlannerData } from '../application/planner-service'

describe('新手資料流程', () => {
  afterEach(() => { cleanup(); localStorage.clear() })
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

  it('新增 0050 ETF 時自動分類、套用股票預設並一次建立行情關聯', async () => {
    const data = createDemoData('2026-09-01')
    const service = new PlannerService({ load: async () => null, save: async () => undefined, clear: async () => undefined })
    const changed = vi.fn()
    const user = userEvent.setup()
    render(<DataPage data={data} summary={service.dashboard(data, 'household')} onChange={changed} />)
    await user.click(screen.getByRole('button', { name: '新增資產' }))
    await user.type(screen.getByLabelText('資產名稱'), '0050')
    await user.selectOptions(screen.getByLabelText('類型'), 'etf')
    expect(screen.getByLabelText(/投資配置分類/)).toHaveValue('stock')
    expect(screen.getByLabelText('使用市場行情更新目前價值')).toBeChecked()
    expect(screen.getByLabelText('上市代碼')).toHaveValue('0050')
    await user.type(screen.getByLabelText('持有數量'), '3000')
    await user.click(screen.getByRole('button', { name: '儲存資產' }))
    const saved = changed.mock.calls[0][0]
    const asset = saved.assets.at(-1)
    expect(asset).toMatchObject({ name: '0050', assetType: 'etf', allocationClass: 'stock', currentValue: { amount: '0', currency: 'TWD' }, scenarioRates: { conservative: '0.04', balanced: '0.06', optimistic: '0.08' }, scenarioRateOrigin: { type: 'systemPreset', presetKey: 'stock' } })
    expect(saved.instruments).toMatchObject([{ assetId: asset.id, symbol: '0050' }])
    expect(saved.holdings).toMatchObject([{ assetId: asset.id, quantity: '3000' }])
  })

  it('預設報酬 Accordion 保留未儲存草稿並可恢復系統預設', async () => {
    const data = createDemoData('2026-09-01')
    const changed = vi.fn()
    const user = userEvent.setup()
    render(<SettingsPage data={data} onChange={changed} />)
    await user.click(screen.getByRole('button', { name: /股票.*4%.*6%.*8%/ }))
    await user.clear(screen.getByLabelText('穩健（%）'))
    await user.type(screen.getByLabelText('穩健（%）'), '7')
    await user.click(screen.getByRole('button', { name: /股票.*4%.*7%.*8%/ }))
    await user.click(screen.getByRole('button', { name: /債券.*2%.*3%.*4%/ }))
    await user.click(screen.getByRole('button', { name: /股票.*4%.*7%.*8%/ }))
    expect(screen.getByLabelText('穩健（%）')).toHaveValue(7)
    expect(screen.getByText('已自訂')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '恢復系統預設' }))
    expect(screen.getByLabelText('穩健（%）')).toHaveValue(6)
    expect(screen.getAllByText('系統預設').length).toBeGreaterThan(0)
  })

  it('美股免費 API key 只儲存在此瀏覽器', async () => {
    const data = createDemoData('2026-09-01')
    const user = userEvent.setup()
    render(<SettingsPage data={data} onChange={vi.fn()} />)
    await user.type(screen.getByLabelText('StashGamma API key'), 'sg_live_browser_only')
    await user.click(screen.getByRole('button', { name: '儲存美股 API key' }))
    expect(localStorage.getItem('retirement-planner-us-eod-api-key-v1')).toBe('sg_live_browser_only')
    expect(screen.getByText('美股 API key 已儲存在此瀏覽器。')).toBeInTheDocument()
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
