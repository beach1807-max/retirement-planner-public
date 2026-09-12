import type { MarketDataBatch, MarketDataProvider, MarketInstrumentRequest } from './market-data-provider'
import { OfficialTaiwanMarketDataProvider } from './market-data-provider'
import { MassiveUsMarketDataProvider } from './massive-market-data-provider'
import { StashGammaUsMarketDataProvider } from './stashgamma-market-data-provider'

const FALLBACK_CODES = new Set(['MASSIVE_KEY_MISSING', 'MASSIVE_NOT_FOUND'])

export class UsMarketDataRouter implements MarketDataProvider {
  readonly id = 'us-market-router-massive-stashgamma-v1'

  constructor(private readonly primary: MarketDataProvider, private readonly fallback: MarketDataProvider) {}

  async fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> {
    const supported = instruments.filter((item) => item.market === 'US')
    const primary = await this.primary.fetchLatest(supported)
    const fallbackIds = new Set(primary.errors.filter((error) => error.instrumentId && FALLBACK_CODES.has(error.code ?? '')).map((error) => error.instrumentId!))
    const fallback = await this.fallback.fetchLatest(supported.filter((item) => fallbackIds.has(item.id)))
    const recoveredIds = new Set(fallback.quotes.map((quote) => quote.instrumentId))
    return {
      quotes: [...primary.quotes, ...fallback.quotes],
      rates: [],
      errors: [...primary.errors.filter((error) => !error.instrumentId || !recoveredIds.has(error.instrumentId)), ...fallback.errors],
      fetchedAt: primary.fetchedAt > fallback.fetchedAt ? primary.fetchedAt : fallback.fetchedAt,
    }
  }
}

export class CombinedMarketDataProvider implements MarketDataProvider {
  readonly id = 'tw-us-market-router-v1'

  constructor(private readonly providers: MarketDataProvider[]) {}

  async fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> {
    const batches = await Promise.all(this.providers.map((provider) => provider.fetchLatest(instruments)))
    return {
      quotes: batches.flatMap((batch) => batch.quotes),
      rates: batches.flatMap((batch) => batch.rates),
      errors: batches.flatMap((batch) => batch.errors),
      fetchedAt: batches.map((batch) => batch.fetchedAt).sort().at(-1) ?? new Date().toISOString(),
    }
  }
}

export function createDefaultMarketDataProvider(): MarketDataProvider {
  return new CombinedMarketDataProvider([
    new OfficialTaiwanMarketDataProvider(),
    new UsMarketDataRouter(new MassiveUsMarketDataProvider(), new StashGammaUsMarketDataProvider()),
  ])
}
