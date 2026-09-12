import { getUsMarketApiKey } from './us-market-api-key'
import type { MarketDataBatch, MarketDataError, MarketDataProvider, MarketInstrumentRequest, ProviderQuote } from './market-data-provider'

export class StashGammaUsMarketDataProvider implements MarketDataProvider {
  readonly id = 'stashgamma-eod-v1'

  async fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> {
    const supported = instruments.filter((item) => item.market === 'US').slice(0, 50)
    const quotes: ProviderQuote[] = []
    const errors: MarketDataError[] = []
    const fetchedAt = new Date().toISOString()
    const apiKey = getUsMarketApiKey()
    if (!apiKey) return { quotes, rates: [], errors: supported.map((instrument) => ({ instrumentId: instrument.id, providerId: this.id, code: 'STASHGAMMA_KEY_MISSING', message: `${instrument.symbol} 未設定 StashGamma API Key，已保留上次有效行情或手動市值。` })), fetchedAt }

    const today = fetchedAt.slice(0, 10)
    const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
    await Promise.all(supported.map(async (instrument) => {
      try {
        const url = new URL(`https://www.stashgamma.com/api/dataapi/v1/eod/${encodeURIComponent(instrument.providerSymbol ?? instrument.symbol)}`)
        url.searchParams.set('from', from); url.searchParams.set('to', today)
        const response = await fetch(url, { headers: { 'X-Api-Key': apiKey } })
        if (!response.ok) throw new Error(`STASHGAMMA_HTTP_${response.status}`)
        const body = await response.json() as { bars?: Array<{ date: string; close: number }> }
        const bar = body.bars?.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.close) && item.close > 0).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
        if (!bar) throw new Error('STASHGAMMA_NOT_FOUND')
        quotes.push({ instrumentId: instrument.id, symbol: instrument.symbol, price: String(bar.close), currency: 'USD', asOf: bar.date, sourceId: 'stashgamma-eod' })
      } catch (error) {
        const value = error instanceof Error ? error.message : ''
        const code = value === 'STASHGAMMA_HTTP_401' ? 'STASHGAMMA_AUTH'
          : value === 'STASHGAMMA_HTTP_404' || value === 'STASHGAMMA_NOT_FOUND' ? 'STASHGAMMA_NOT_FOUND'
          : value === 'STASHGAMMA_HTTP_429' ? 'STASHGAMMA_RATE_LIMIT'
          : value.startsWith('STASHGAMMA_HTTP_5') ? 'STASHGAMMA_SERVER'
          : value.startsWith('STASHGAMMA_HTTP_') ? 'STASHGAMMA_HTTP'
          : error instanceof SyntaxError ? 'STASHGAMMA_INVALID_RESPONSE' : 'STASHGAMMA_NETWORK'
        const reason = code === 'STASHGAMMA_AUTH' ? '401 API Key 無效或已失效。'
          : code === 'STASHGAMMA_NOT_FOUND' ? '404 查無此代號的收盤行情。'
          : code === 'STASHGAMMA_RATE_LIMIT' ? '429 API 額度限制，請稍後再試。'
          : code === 'STASHGAMMA_SERVER' ? '供應商服務異常，請稍後再試。'
          : code === 'STASHGAMMA_INVALID_RESPONSE' ? '行情回傳格式錯誤。'
          : code === 'STASHGAMMA_NETWORK' ? '網路連線失敗。' : `行情服務 HTTP ${value.slice(16)} 錯誤。`
        errors.push({ instrumentId: instrument.id, providerId: this.id, code, message: `${instrument.symbol} StashGamma：${reason}` })
      }
    }))
    return { quotes, rates: [], errors, fetchedAt }
  }
}
