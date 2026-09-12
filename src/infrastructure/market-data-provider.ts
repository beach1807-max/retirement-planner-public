export interface MarketInstrumentRequest { id: string; symbol: string; market: 'TWSE' | 'TPEX' | 'US'; currency: string; providerSymbol?: string; instrumentKey?: string }
export interface ProviderQuote { instrumentId: string; symbol: string; price: string; currency: string; asOf: string; sourceId: string }
export interface ProviderRate { fromCurrency: string; toCurrency: 'TWD'; rate: string; asOf: string; sourceId: string }
export interface MarketDataError { instrumentId?: string; code?: string; providerId?: string; message: string }
export interface MarketDataBatch { quotes: ProviderQuote[]; rates: ProviderRate[]; errors: MarketDataError[]; fetchedAt: string }
export interface MarketDataProvider { readonly id: string; fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> }

interface ApiResponse {
  quotes: Array<Omit<ProviderQuote, 'instrumentId'>>
  rates: ProviderRate[]
  errors?: Array<{ symbol?: string; message: string }>
  fetchedAt: string
}

export class OfficialTaiwanMarketDataProvider implements MarketDataProvider {
  readonly id = 'twse-finmind-cbc-v0.12'
  constructor(private readonly endpoint = '/api/market-data') {}

  async fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> {
    const supported = instruments.filter((item) => item.market !== 'US').slice(0, 50)
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
    const missing = supported.filter((item) => !quotes.some((quote) => quote.instrumentId === item.id) && !tpexErrors.some((error) => error.instrumentId === item.id)).map((item) => ({ instrumentId: item.id, message: `${item.symbol} 查無最新有效收盤價。` }))
    const apiErrors = (payload.errors ?? []).filter((error) => !error.symbol || !quotes.some((quote) => quote.symbol === error.symbol)).map((error) => ({ instrumentId: twseInstruments.find((item) => item.symbol === error.symbol)?.id, message: error.message }))
    return { quotes, rates: payload.rates, errors: [...apiErrors, ...tpexErrors, ...missing], fetchedAt: payload.fetchedAt }
  }
}
