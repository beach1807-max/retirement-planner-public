import { useState, type FormEvent } from 'react'
import { ExternalLink, RefreshCw, Save } from 'lucide-react'
import type { PlannerAccount, PlannerData, PlannerHolding, PlannerInstrument } from '../application/planner-data'
import { MarketDataService, type MarketUpdateReport } from '../application/market-data-service'

interface Props { data: PlannerData; service: MarketDataService; onChange: (data: PlannerData) => void | Promise<void> }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 4 })

export function MarketDataPage({ data, service, onChange }: Props) {
  const [report, setReport] = useState<MarketUpdateReport | null>(null)
  const [updating, setUpdating] = useState(false)
  const marketAssets = data.assets.filter((asset) => asset.assetType === 'stockEtf')
  const lastStamp = data.marketDataStamps.at(-1)
  const freshnessReference = new Date(lastStamp?.completedAt ?? `${data.calculationBaseDate}T00:00:00Z`).getTime()
  const staleQuotes = data.marketQuotes.filter((quote) => freshnessReference - new Date(`${quote.asOf}T00:00:00Z`).getTime() > 7 * 86400000)

  async function saveMappings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const now = new Date().toISOString()
    const next = structuredClone(data)
    let account = next.accounts.find((item) => item.id === 'market-tracked-account')
    if (!account) {
      account = { id: 'market-tracked-account', householdId: data.household.id, name: '行情追蹤帳戶', institution: '手動行情更新', accountType: 'brokerage', ownershipType: 'household', status: 'provided', createdAt: now, updatedAt: now } satisfies PlannerAccount
      next.accounts.push(account)
    }
    for (const asset of marketAssets) {
      const symbol = String(form.get(`symbol-${asset.id}`) ?? '').trim().toUpperCase()
      const quantity = String(form.get(`quantity-${asset.id}`) ?? '')
      if (!symbol || !quantity) continue
      const existingInstrument = next.instruments.find((item) => item.assetId === asset.id)
      const instrument: PlannerInstrument = { id: existingInstrument?.id ?? crypto.randomUUID(), householdId: data.household.id, assetId: asset.id, symbol, market: 'TWSE', currency: 'TWD', createdAt: existingInstrument?.createdAt ?? now, updatedAt: now }
      next.instruments = existingInstrument ? next.instruments.map((item) => item.id === existingInstrument.id ? instrument : item) : [...next.instruments, instrument]
      const existingHolding = next.holdings.find((item) => item.assetId === asset.id)
      const holding: PlannerHolding = { id: existingHolding?.id ?? crypto.randomUUID(), householdId: data.household.id, accountId: existingHolding?.accountId ?? account.id, assetId: asset.id, quantity, status: 'provided', createdAt: existingHolding?.createdAt ?? now, updatedAt: now }
      next.holdings = existingHolding ? next.holdings.map((item) => item.id === existingHolding.id ? holding : item) : [...next.holdings, holding]
    }
    await onChange(next)
    setReport({ status: 'success', updatedAssetIds: [], errors: [], attemptedAt: now, completedAt: now })
  }

  async function refresh() {
    setUpdating(true)
    const updated = await service.refresh(data)
    await onChange(updated.data)
    setReport(updated.report)
    setUpdating(false)
  }

  return <div className="page-stack"><section className="panel"><div className="panel-heading"><div><h2><RefreshCw size={21} /> 手動行情更新</h2><p>只在你按下更新時取得非即時的最新可用收盤價與匯率；離線或部分失敗會保留上次有效資料。</p></div><button className="button primary" disabled={updating || data.instruments.length === 0} onClick={() => void refresh()}><RefreshCw size={18} />{updating ? '更新中…' : '更新股票、ETF 與匯率'}</button></div><div className="source-links"><a href="https://openapi.twse.com.tw/" target="_blank" rel="noreferrer">臺灣證券交易所 OpenAPI <ExternalLink size={15} /></a><a href="https://cpx.cbc.gov.tw/Data/ExportToAPIInfo" target="_blank" rel="noreferrer">中央銀行統計資料庫 API <ExternalLink size={15} /></a></div>{(report || lastStamp) && <div className={`alert ${(report ?? lastStamp)?.status === 'success' ? 'success' : (report ?? lastStamp)?.status === 'failed' ? 'error' : 'info'}`} role="status">{(report ?? lastStamp)?.status === 'success' ? '行情與匯率更新完成。' : (report ?? lastStamp)?.status === 'partial' ? '部分資料已更新，其餘保留上次有效值。' : '更新失敗，已保留上次有效值。'} {(report ?? lastStamp)?.errors.join(' ')}</div>}{staleQuotes.length > 0 && <div className="alert info">有 {staleQuotes.length} 筆行情超過 7 天，離線規劃仍可使用，但請勿視為最新價格。</div>}</section>
    <section className="panel"><div className="panel-heading"><div><h3>標的與持有數量</h3><p>第一版行情來源支援臺灣證券交易所上市股票與 ETF；市值以持有數量 × 收盤價計算。</p></div></div><form className="settings-form" onSubmit={saveMappings}>{marketAssets.map((asset) => { const instrument = data.instruments.find((item) => item.assetId === asset.id); const holding = data.holdings.find((item) => item.assetId === asset.id); return <fieldset key={asset.id}><legend>{asset.name}</legend><div className="form-grid three"><label>上市代碼<input name={`symbol-${asset.id}`} pattern="\d{4,6}[A-Z]?" placeholder="例如 0050" defaultValue={instrument?.symbol ?? ''} /></label><label>持有數量<input name={`quantity-${asset.id}`} type="number" min="0" step="any" defaultValue={holding?.quantity ?? ''} /></label><label>目前 TWD 市值<input value={asset.currentValue.currency === 'TWD' ? currency.format(Number(asset.currentValue.amount)) : '需匯率'} readOnly /></label></div></fieldset>})}{marketAssets.length === 0 && <div className="empty-state">尚無股票／ETF 資產。</div>}<div className="form-actions"><button className="button secondary" type="submit"><Save size={18} />儲存標的設定</button></div></form></section>
    <section className="panel"><div className="panel-heading"><div><h3>最近有效資料</h3><p>快取會納入 JSON 備份；離線時仍可使用，但不宣稱為最新行情。</p></div><small>{lastStamp ? `最後嘗試 ${new Date(lastStamp.completedAt).toLocaleString('zh-TW')}` : '尚未更新'}</small></div><div className="market-grid"><div><h3>收盤價</h3>{data.marketQuotes.length ? data.marketQuotes.map((quote) => <article key={quote.id}><strong>{quote.symbol}</strong><span>{quote.price} {quote.currency}</span><small>{quote.asOf} · {quote.sourceId}</small></article>) : <p className="muted">尚無行情。</p>}</div><div><h3>匯率（每單位外幣兌 TWD）</h3>{data.exchangeRates.filter((rate) => ['USD', 'JPY', 'EUR'].includes(rate.fromCurrency)).map((rate) => <article key={rate.id}><strong>{rate.fromCurrency}/TWD</strong><span>{Number(rate.rate).toFixed(4)}</span><small>{rate.asOf} · {rate.sourceId}</small></article>)}</div></div></section>
  </div>
}
