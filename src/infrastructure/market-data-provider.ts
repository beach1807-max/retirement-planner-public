import { getUsMarketApiKey } from './us-market-api-key'

export interface MarketInstrumentRequest { id: string; symbol: string; market: 'TWSE' | 'TPEX' | 'US'; currency: string; providerSymbol?: string; instrumentKey?: string }
export interface ProviderQuote { instrumentId: string; symbol: string; price: string; currency: string; asOf: string; sourceId: string }
export interface ProviderRate { fromCurrency: string; toCurrency: 'TWD'; rate: string; asOf: string; sourceId: string }
export interface MarketDataBatch { quotes: ProviderQuote[]; rates: ProviderRate[]; errors: Array<{ instrumentId?: string; message: string }>; fetchedAt: string }
export interface MarketDataProvider { readonly id: string; fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> }

interface ApiResponse {
  quotes: Array<Omit<ProviderQuote, 'instrumentId'>>
  rates: ProviderRate[]
  errors?: Array<{ symbol?: string; message: string }>
  fetchedAt: string
}

export class OfficialTaiwanMarketDataProvider implements MarketDataProvider {
  readonly id = 'twse-finmind-stashgamma-eod-v0.11'
  constructor(private readonly endpoint = '/api/market-data') {}

  async fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> {
    const supported = instruments.slice(0, 50)
    const twseInstruments = supported.filter((item) => item.market === 'TWSE')
    let payload: ApiResponse = { quotes: [], rates: [], fetchedAt: new Date().toISOString() }
    try {
      const response = await fetch(`${this.endpoint}?instruments=${encodeURIComponent(twseInstruments.map((item) => `TWSE:${item.providerSymbol ?? item.symbol}`).join(','))}`)
      if (!response.ok) throw new Error(`MARKET_PROVIDER_HTTP_${response.status}`)
      payload = await response.json() as ApiResponse
    } catch { payload.errors = [{ message: '台股／匯率來源連線失敗，其他來源仍會繼續更新。' }] }
    const quotes = payload.quotes.flatMap((quote) => {
      return twseInstruments.filter((item) => item.symbol === quote.symbol).map((instrument) => ({ ...quote, instrumentId: instrument.id }))
    })
    const today = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
    const tpexInstruments = supported.filter((item) => item.market !== 'US' && !quotes.some((quote) => quote.instrumentId === item.id))
    const tpexErrors: Array<{ instrumentId?: string; message: string }> = []
    await Promise.all(tpexInstruments.map(async (instrument) => {
      try {
        const url = new URL('https://api.finmindtrade.com/api/v4/data')
        url.searchParams.set('dataset', 'TaiwanStockPrice'); url.searchParams.set('data_id', instrument.providerSymbol ?? instrument.symbol); url.searchParams.set('start_date', from); url.searchParams.set('end_date', today)
        const tpexResponse = await fetch(url)
        if (!tpexResponse.ok) throw new Error(`TPEX_EOD_HTTP_${tpexResponse.status}`)
        const body = await tpexResponse.json() as { data?: Array<{ date: string; close: number }> }
        const bar = body.data?.at(-1)
        if (!bar || !Number.isFinite(Number(bar.close))) throw new Error('TPEX_EOD_EMPTY')
        quotes.push({ instrumentId: instrument.id, symbol: instrument.symbol, price: String(bar.close), currency: 'TWD', asOf: bar.date, sourceId: 'finmind-taiwan-stock-price' })
      } catch { tpexErrors.push({ instrumentId: instrument.id, message: `${instrument.symbol} 台股收盤價經 FinMind 重試仍無法取得。` }) }
    }))
    const apiKey = getUsMarketApiKey()
    const usInstruments = supported.filter((item) => item.market === 'US')
    const usErrors: Array<{ instrumentId?: string; message: string }> = []
    if (!apiKey) usErrors.push(...usInstruments.map((instrument) => ({ instrumentId: instrument.id, message: `${instrument.symbol} 尚未在預測設定儲存免費美股 API key，已保留上次有效行情或手動市值。` })))
    if (apiKey) {
      await Promise.all(usInstruments.map(async (instrument) => {
        try {
          const url = new URL(`https://www.stashgamma.com/api/dataapi/v1/eod/${encodeURIComponent(instrument.providerSymbol ?? instrument.symbol)}`)
          url.searchParams.set('from', from); url.searchParams.set('to', today)
          const usResponse = await fetch(url, { headers: { 'X-Api-Key': apiKey } })
          if (!usResponse.ok) throw new Error(`US_EOD_HTTP_${usResponse.status}`)
          const body = await usResponse.json() as { bars?: Array<{ date: string; close: number }> }
          const bar = body.bars?.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.close) && item.close > 0).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
          if (!bar || !Number.isFinite(Number(bar.close))) throw new Error('US_EOD_EMPTY')
          quotes.push({ instrumentId: instrument.id, symbol: instrument.symbol, price: String(bar.close), currency: 'USD', asOf: bar.date, sourceId: 'stashgamma-eod' })
        } catch (error) {
          const code = error instanceof Error ? error.message : ''
          const reason = code === 'US_EOD_HTTP_401' ? '401 API Key 無效或已失效，請至預測設定重新儲存。'
            : code === 'US_EOD_HTTP_404' ? '404 查無此代號的收盤行情。'
            : code === 'US_EOD_HTTP_429' ? '429 API 額度限制，請稍後再試。'
            : code === 'US_EOD_EMPTY' ? '回傳資料沒有有效收盤價。'
            : code.startsWith('US_EOD_HTTP_') ? '行情服務 HTTP ' + code.slice(12) + ' 錯誤。'
            : error instanceof SyntaxError ? '行情回傳格式錯誤。'
            : '網路連線失敗（可能為離線或跨來源連線受阻）。'
          usErrors.push({ instrumentId: instrument.id, message: instrument.symbol + ' ' + reason })
        }
      }))
    }
    const missing = supported.filter((item) => !quotes.some((quote) => quote.instrumentId === item.id) && !tpexErrors.some((error) => error.instrumentId === item.id) && !usErrors.some((error) => error.instrumentId === item.id)).map((item) => ({ instrumentId: item.id, message: `${item.symbol} 查無最新有效收盤價。` }))
    const apiErrors = (payload.errors ?? []).filter((error) => !error.symbol || !quotes.some((quote) => quote.symbol === error.symbol)).map((error) => ({ instrumentId: twseInstruments.find((item) => item.symbol === error.symbol)?.id, message: error.message }))
    return { quotes, rates: payload.rates, errors: [...apiErrors, ...tpexErrors, ...usErrors, ...missing], fetchedAt: payload.fetchedAt }
  }
}
