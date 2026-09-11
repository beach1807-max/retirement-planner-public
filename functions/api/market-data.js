const TWSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
const CBC_URL = 'https://cpx.cbc.gov.tw/api/OpenData/FTDOpenData_Day'
const isoTaiwanDate = (value) => { const digits = String(value ?? '').replace(/\D/g, ''); return digits.length === 7 ? `${Number(digits.slice(0, 3)) + 1911}-${digits.slice(3, 5)}-${digits.slice(5, 7)}` : new Date().toISOString().slice(0, 10) }
const isoCbcDate = (value) => `${String(value).slice(0, 4)}-${String(value).slice(4, 6)}-${String(value).slice(6, 8)}`
const parse = (value) => [...new Set(String(value ?? '').split(',').map((item) => item.trim().toUpperCase()).filter((item) => /^TWSE:\d{4,6}[A-Z]?$/.test(item)))].slice(0, 50).map((item) => ({ market: 'TWSE', symbol: item.split(':')[1] }))
const makeQuote = (market, symbol, price, currency, asOf, sourceId) => ({ market, symbol, price: String(price), currency, asOf, sourceId })
async function taiwan(symbols) {
  const response = await fetch(TWSE_URL, { headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error(`TWSE_HTTP_${response.status}`)
  const rows = await response.json()
  return rows.flatMap((row) => { const symbol = String(row.Code ?? row['證券代號'] ?? '').trim(); const price = Number(String(row.ClosingPrice ?? row['收盤'] ?? '').replace(/,/g, '')); return symbols.includes(symbol) && Number.isFinite(price) ? [makeQuote('TWSE', symbol, price, 'TWD', isoTaiwanDate(row.Date ?? row['日期']), 'twse-openapi-v1')] : [] })
}
export async function onRequestGet(context) {
  const instruments = parse(new URL(context.request.url).searchParams.get('instruments')); const fetchedAt = new Date().toISOString(); const errors = []; const quotes = []; let rates = []
  const symbols = instruments.map((item) => item.symbol); if (symbols.length) try { quotes.push(...await taiwan(symbols)) } catch { errors.push({ market: 'TWSE', code: 'TWSE_UPSTREAM_UNAVAILABLE', message: '臺灣證券交易所收盤價暫時無法取得。' }) }
  try { const response = await fetch(CBC_URL, { headers: { Accept: 'application/json' } }); const rows = response.ok && await response.json(); const row = rows?.at(-1); const rate = Number(row?.NTD_USD); if (!Number.isFinite(rate)) throw new Error(); rates = [{ fromCurrency: 'USD', toCurrency: 'TWD', rate: String(rate), asOf: isoCbcDate(row['日期']), sourceId: 'cbc-ftd-day' }] } catch { errors.push({ message: '中央銀行 USD/TWD 匯率暫時無法取得。' }) }
  return Response.json({ quotes, rates, errors, fetchedAt }, { headers: { 'Cache-Control': 'public, max-age=900', 'X-Content-Type-Options': 'nosniff' } })
}
