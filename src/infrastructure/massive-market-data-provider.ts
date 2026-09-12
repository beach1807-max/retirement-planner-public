import { getMassiveApiKey } from './massive-api-key'
import type { MarketDataBatch, MarketDataError, MarketDataProvider, MarketInstrumentRequest, ProviderQuote } from './market-data-provider'

function marketDate(timestamp: number): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp))
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function massiveError(instrument: MarketInstrumentRequest, code: string, message: string): MarketDataError {
  return { instrumentId: instrument.id, providerId: 'massive-prev-day-v1', code, message: `${instrument.symbol} Massive：${message}` }
}

export class MassiveUsMarketDataProvider implements MarketDataProvider {
  readonly id = 'massive-prev-day-v1'

  async fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> {
    const supported = instruments.filter((item) => item.market === 'US').slice(0, 50)
    const quotes: ProviderQuote[] = []
    const errors: MarketDataError[] = []
    const fetchedAt = new Date().toISOString()
    const apiKey = getMassiveApiKey()
    if (!apiKey) return { quotes, rates: [], errors: supported.map((instrument) => massiveError(instrument, 'MASSIVE_KEY_MISSING', '未設定 API Key。')), fetchedAt }

    await Promise.all(supported.map(async (instrument) => {
      try {
        const symbol = instrument.providerSymbol ?? instrument.symbol
        const response = await fetch(`https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev`, { headers: { Authorization: `Bearer ${apiKey}` } })
        if (!response.ok) throw new Error(`MASSIVE_HTTP_${response.status}`)
        const body = await response.json() as { results?: Array<{ c: number; t: number }> }
        const bar = body.results?.[0]
        if (!bar || !Number.isFinite(bar.c) || bar.c <= 0 || !Number.isFinite(bar.t)) throw new Error('MASSIVE_NOT_FOUND')
        quotes.push({ instrumentId: instrument.id, symbol: instrument.symbol, price: String(bar.c), currency: 'USD', asOf: marketDate(bar.t), sourceId: 'massive-prev-day' })
      } catch (error) {
        const value = error instanceof Error ? error.message : ''
        if (value === 'MASSIVE_HTTP_401' || value === 'MASSIVE_HTTP_403') errors.push(massiveError(instrument, 'MASSIVE_AUTH', `${value.slice(-3)} API Key 無效或目前方案沒有權限。`))
        else if (value === 'MASSIVE_HTTP_404' || value === 'MASSIVE_NOT_FOUND') errors.push(massiveError(instrument, 'MASSIVE_NOT_FOUND', '查無此代號的前一交易日行情。'))
        else if (value === 'MASSIVE_HTTP_429') errors.push(massiveError(instrument, 'MASSIVE_RATE_LIMIT', '429 API 額度限制，請稍後再試。'))
        else if (/^MASSIVE_HTTP_5\d\d$/.test(value)) errors.push(massiveError(instrument, 'MASSIVE_SERVER', `${value.slice(-3)} 供應商服務異常，請稍後再試。`))
        else if (value.startsWith('MASSIVE_HTTP_')) errors.push(massiveError(instrument, 'MASSIVE_HTTP', `行情服務 HTTP ${value.slice(13)} 錯誤。`))
        else if (error instanceof SyntaxError) errors.push(massiveError(instrument, 'MASSIVE_INVALID_RESPONSE', '行情回傳格式錯誤。'))
        else errors.push(massiveError(instrument, 'MASSIVE_NETWORK', '網路連線失敗。'))
      }
    }))
    return { quotes, rates: [], errors, fetchedAt }
  }
}

export interface UsInstrumentReference {
  symbol: string
  name?: string
  market?: string
  primaryExchange?: string
  currency?: string
  active?: boolean
}

export interface UsInstrumentReferenceProvider {
  fetchTickerDetails(symbol: string): Promise<UsInstrumentReference | null>
}

export class MassiveInstrumentReferenceProvider implements UsInstrumentReferenceProvider {
  async fetchTickerDetails(symbol: string): Promise<UsInstrumentReference | null> {
    const apiKey = getMassiveApiKey()
    if (!apiKey) return null
    const response = await fetch(`https://api.massive.com/v3/reference/tickers/${encodeURIComponent(symbol.trim().toUpperCase())}`, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`MASSIVE_REFERENCE_HTTP_${response.status}`)
    const body = await response.json() as { results?: { ticker?: string; name?: string; market?: string; primary_exchange?: string; currency_name?: string; active?: boolean } }
    const result = body.results
    return result?.ticker ? { symbol: result.ticker, name: result.name, market: result.market, primaryExchange: result.primary_exchange, currency: result.currency_name?.toUpperCase(), active: result.active } : null
  }
}
