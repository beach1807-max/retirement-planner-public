import Decimal from 'decimal.js'
import { formatMoney } from '../application/money'
import { useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import type { PlannerData } from '../application/planner-data'
import { MarketDataService, type MarketUpdateReport } from '../application/market-data-service'
import { CalculationHelp } from './CalculationHelp'
import { hasUsMarketApiKey } from '../infrastructure/us-market-api-key'

interface Props { data: PlannerData; service: MarketDataService; onChange: (data: PlannerData) => void | Promise<void> }


export function MarketDataPage({ data, service, onChange }: Props) {
  const [report, setReport] = useState<MarketUpdateReport | null>(null)
  const [updating, setUpdating] = useState(false)
  const lastStamp = data.marketDataStamps.at(-1)
  const linkedAssets = data.instruments.map((instrument) => {
    const holdings = data.holdings.filter((holding) => holding.assetId === instrument.assetId && holding.status === 'provided')
    return {
      instrument,
      asset: data.assets.find((asset) => asset.id === instrument.assetId),
      totalQuantity: holdings.reduce((sum, holding) => sum.plus(holding.quantity), new Decimal(0)).toString(),
      holdingCount: holdings.length,
      quote: data.marketQuotes.find((quote) => quote.instrumentId === instrument.id),
    }
  })
  const freshnessReference = new Date(lastStamp?.completedAt ?? `${data.calculationBaseDate}T00:00:00Z`).getTime()
  const staleQuotes = data.marketQuotes.filter((quote) => freshnessReference - new Date(`${quote.asOf}T00:00:00Z`).getTime() > 7 * 86400000)

  async function refresh() {
    setUpdating(true)
    try {
      const updated = await service.refresh(data)
      await onChange(updated.data)
      setReport(updated.report)
    } finally {
      setUpdating(false)
    }
  }

  const activeReport = report ?? lastStamp
  return <div className="page-stack">
    {data.instruments.some((instrument) => instrument.market === 'US') && !hasUsMarketApiKey() && <div className="alert info">美股收盤價需要先到「預測設定」儲存自己的免費 StashGamma API key；未設定時會保留手動市值。</div>}
    <section className="panel"><div className="panel-heading"><div><h2><RefreshCw size={21} /> 行情更新</h2><p>查看已連結標的狀態，並在需要時一次更新所有行情與匯率。失敗時會保留上次有效市值。</p></div><button className="button primary" disabled={updating} onClick={() => void refresh()}><RefreshCw size={18} />{updating ? '更新中…' : '更新所有行情'}</button></div><div className="source-links"><a href="https://openapi.twse.com.tw/" target="_blank" rel="noreferrer">臺灣證券交易所行情來源 <ExternalLink size={15} /></a><a href="https://cpx.cbc.gov.tw/Data/ExportToAPIInfo" target="_blank" rel="noreferrer">中央銀行匯率來源 <ExternalLink size={15} /></a></div>{activeReport && <div className={`alert ${activeReport.status === 'success' ? 'success' : activeReport.status === 'failed' ? 'error' : 'info'}`} role="status">{activeReport.status === 'success' ? '行情與匯率更新完成。' : activeReport.status === 'partial' ? '部分資料已更新，其餘保留上次有效值。' : '更新失敗，已保留上次有效值。'} {activeReport.errors.join(' ')}</div>}{staleQuotes.length > 0 && <div className="alert info">有 {staleQuotes.length} 筆行情超過 7 天，請勿視為最新價格。</div>}</section>
    <section className="panel"><div className="panel-heading"><div><h3><CalculationHelp label="已連結行情資產" topic="marketValue" /></h3><p>市場、代碼、持有數量與帳戶請回「家庭資料」編輯資產，不需在這裡重複設定。</p></div></div><div className="data-list">{linkedAssets.map(({ instrument, asset, totalQuantity, holdingCount, quote }) => <article key={instrument.id}><div><strong>{asset?.name ?? '未知資產'} · {instrument.market} · {instrument.symbol}</strong><p>{holdingCount ? `${holdingCount} 個有效部位，共 ${totalQuantity}` : '尚無有效持有數量'} · {quote ? `收盤日 ${quote.asOf}` : '等待首次更新'}</p></div><strong>{asset ? formatMoney(asset.currentValue) : '—'}</strong></article>)}{linkedAssets.length === 0 && <div className="empty-state">尚未連結行情資產。請到「家庭資料」新增或編輯股票／ETF。</div>}</div></section>
    <section className="panel"><div className="panel-heading"><div><h3>最近有效資料</h3><p>快取會納入 JSON 備份；離線時仍可使用，但不宣稱為最新行情。</p></div><small>{lastStamp ? `最後嘗試 ${new Date(lastStamp.completedAt).toLocaleString('zh-TW')}` : '尚未更新'}</small></div><div className="market-grid"><div><h3>收盤價</h3>{data.marketQuotes.length ? data.marketQuotes.map((quote) => <article key={quote.id}><strong>{quote.symbol}</strong><span>{quote.price} {quote.currency}</span><small>{quote.asOf} · {quote.sourceId}</small></article>) : <p className="muted">尚無行情。</p>}</div><div><h3>匯率</h3>{data.exchangeRates.filter((rate) => ['USD', 'JPY', 'EUR'].includes(rate.fromCurrency)).map((rate) => <article key={rate.id}><strong>{rate.fromCurrency}/TWD</strong><span>{Number(rate.rate).toFixed(4)}</span><small>{rate.asOf} · {rate.sourceId}</small></article>)}</div></div></section>
  </div>
}
