import { expect, test, type Page } from '@playwright/test'
import { createDemoData, createStarterData, type PlannerData } from '../src/application/planner-data'

async function seed(page: Page, data: PlannerData) {
  await page.goto('/')
  await page.getByRole('button', { name: '快速試算我的未來資產' }).waitFor()
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('retirement-planner-public')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('planner', 'readwrite')
        tx.objectStore('planner').put({ id: 'current', data: value, updatedAt: value.updatedAt })
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
    })
  }, data)
  await page.reload()
  await page.getByRole('button', { name: '家庭資料', exact: true }).click()
}
async function stored(page: Page): Promise<PlannerData> {
  return page.evaluate(async () => new Promise((resolve, reject) => {
    const open = indexedDB.open('retirement-planner-public')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const get = db.transaction('planner').objectStore('planner').get('current')
      get.onsuccess = () => { resolve(get.result.data); db.close() }
      get.onerror = () => reject(get.error)
    }
  }))
}
async function quick(page: Page) {
  await page.getByRole('button', { name: '快速新增資產 Beta', exact: true }).click()
  return page.getByRole('region', { name: '快速新增資產 Beta' })
}

test('Beta：股票ETF、美元、現金、不動產共存，保存重載與手機版面', async ({ page }, testInfo) => {
  const initial = createDemoData('2026-09-01')
  await seed(page, initial)
  let form = await quick(page)
  await form.getByRole('button', { name: /投資商品/ }).click()
  await form.getByLabel('資產種類').selectOption('etf')
  await form.getByRole('combobox', { name: '幣別', exact: true }).selectOption('USD')
  await form.getByLabel('名稱', { exact: true }).fill('Beta 美元債券')
  await form.getByLabel('主要投資類別').selectOption('bond')
  await form.getByLabel('持有數量（股／受益權單位）').fill('10')
  await form.getByLabel('單價（USD）').fill('70')
  await form.getByLabel(/手動美元匯率/).fill('32')
  await page.screenshot({ path: testInfo.outputPath('beta-input.png'), fullPage: true })
  await form.getByRole('button', { name: '檢查並繼續' }).click()
  await form.getByRole('button', { name: '完成新增' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已儲存資產並加入' })).toBeVisible()
  form = await quick(page)
  await form.getByRole('button', { name: /現金／存款/ }).click()
  await form.getByLabel('名稱', { exact: true }).fill('Beta 生活費')
  await form.getByLabel('目前餘額（TWD）').fill('25000')
  await form.getByRole('button', { name: '檢查並繼續' }).click()
  await form.getByRole('button', { name: '完成新增' }).click()
  await expect(form).not.toBeVisible()
  form = await quick(page)
  await form.getByRole('button', { name: /其他資產/ }).click()
  await form.getByLabel('資產種類').selectOption('property')
  await form.getByLabel('名稱', { exact: true }).fill('Beta 房屋')
  await form.getByLabel('目前估計價值（TWD）').fill('8000000')
  await expect(form.getByLabel('加入投資組合與長期預測')).toBeDisabled()
  await form.getByRole('button', { name: '檢查並繼續' }).click()
  await form.getByRole('button', { name: '完成新增' }).click()
  await expect(form).not.toBeVisible()
  const saved = await stored(page)
  expect(saved.assets).toHaveLength(initial.assets.length + 3)
  expect(saved.assets.at(-3)).toMatchObject({ assetType: 'etf', allocationClass: 'bond', currentValue: { amount: '700.00', currency: 'USD' } })
  expect(saved.assets.at(-1)?.assetType).toBe('property')
  expect(saved.portfolios[0].assetIds).not.toContain(saved.assets.at(-1)?.id)
  expect(saved.portfolios[0].targets).toEqual(initial.portfolios[0].targets)
  await page.reload()
  await page.getByRole('button', { name: '家庭資料', exact: true }).click()
  await expect(page.getByRole('button', { name: '編輯 Beta 房屋' })).toBeVisible()
  await page.getByRole('button', { name: '編輯 Beta 美元債券' }).click()
  await page.getByLabel('資產名稱').fill('Beta 美債改名')
  await page.getByRole('button', { name: '儲存資產', exact: true }).click()
  await expect(page.getByRole('button', { name: '編輯 Beta 美債改名' })).toBeVisible()
  expect((await stored(page)).holdings).toEqual(saved.holdings)
  await page.getByRole('button', { name: '刪除 Beta 美債改名' }).click()
  await expect(page.getByRole('button', { name: '編輯 Beta 美債改名' })).not.toBeVisible()
  const deleted = await stored(page)
  expect(deleted.portfolios[0].assetIds).not.toContain(saved.assets.at(-3)?.id)
  await page.getByRole('button', { name: '投資組合', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的投資組合' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Beta：查價與真實儲存模型、備份匯出還原', async ({ page, isMobile }) => {
  await seed(page, createDemoData('2026-09-01'))
  await page.route('**/api/market-data?*', (route) => route.fulfill({ json: { quotes: [{ symbol: '0050', price: '75', currency: 'TWD', asOf: '2026-09-11', sourceId: 'e2e-fixture' }], rates: [], fetchedAt: '2026-09-13T00:00:00Z' } }))
  const form = await quick(page)
  await form.getByRole('button', { name: /投資商品/ }).click()
  await form.getByLabel('資產種類').selectOption('etf')
  await form.getByLabel('商品代號').fill('0050')
  await form.getByLabel('我已確認此商品的上市／上櫃市場').check()
  await form.getByRole('button', { name: '查詢商品', exact: true }).click()
  await expect(form.getByLabel('單價（TWD）')).toHaveValue('75')
  await form.getByLabel('名稱', { exact: true }).fill('Beta 台股 ETF')
  await form.getByLabel('主要投資類別').selectOption('stock')
  await form.getByLabel('持有數量（股／受益權單位）').fill('1000')
  await form.getByRole('button', { name: '檢查並繼續' }).click()
  await form.getByRole('button', { name: '完成新增' }).click()
  await expect(form).not.toBeVisible()
  const before = await stored(page)
  expect(before.instruments[0].instrumentType).toBe('etf')
  expect(before.assets.at(-1)?.currentValue.amount).toBe('75000.00')
  if (isMobile) {
    await page.getByRole('button', { name: '更多功能' }).click()
    await page.getByRole('dialog').getByRole('button', { name: '資料與備份' }).click()
  } else await page.getByRole('button', { name: '資料與備份', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /匯出.*JSON|下載.*備份|匯出備份/ }).click()
  const file = await download
  const path = await file.path()
  expect(path).toBeTruthy()
  await page.locator('input[type="file"]').setInputFiles(path!)
  await expect(page.getByRole('status').filter({ hasText: '備份已還原' })).toBeVisible()
  await expect.poll(async () => (await stored(page)).assets.at(-1)?.name).toBe('Beta 台股 ETF')
  expect((await stored(page)).instruments).toEqual(before.instruments)
})

test('Beta：首次組合、離線及資料庫失敗保留草稿', async ({ page, context }) => {
  const initial = createStarterData({ householdName: '測試', primaryName: '我', primaryBirthDate: '1990-01-01', planningEndAge: 90, calculationBaseDate: '2026-09-01' })
  await seed(page, initial)
  const form = await quick(page)
  await form.getByRole('button', { name: /現金／存款/ }).click()
  await form.getByLabel('名稱', { exact: true }).fill('第一筆')
  await form.getByLabel('目前餘額（TWD）').fill('10000')
  await form.getByLabel('現金目標（%）').fill('100')
  await form.getByLabel('我已確認上述目標比例').check()
  await context.setOffline(true)
  await form.getByRole('button', { name: '檢查並繼續' }).click()
  await page.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('test quota', 'QuotaExceededError') } })
  await form.getByRole('button', { name: '完成新增' }).click()
  await expect(form.getByRole('alert')).toContainText('輸入已保留')
  expect((await stored(page)).assets).toHaveLength(0)
  await context.setOffline(false)
})

