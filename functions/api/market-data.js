const TWSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
const CBC_URL = 'https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=BP01D01'

const isoTwseDate = (value) => `${Number(value.slice(0, 3)) + 1911}-${value.slice(3, 5)}-${value.slice(5, 7)}`
const isoCbcDate = (value) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const symbols = [...new Set((url.searchParams.get('symbols') ?? '').split(',').map((item) => item.trim()).filter((item) => /^\d{4,6}[A-Z]?$/.test(item)))].slice(0, 50)
  const fetchedAt = new Date().toISOString()
  const errors = []
  let quotes = []
  let rates = []
  try {
    const response = await fetch(TWSE_URL, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`TWSE ${response.status}`)
    const rows = await response.json()
    quotes = rows.filter((row) => symbols.includes(row.Code) && Number.isFinite(Number(row.ClosingPrice))).map((row) => ({ symbol: row.Code, price: String(Number(row.ClosingPrice)), currency: 'TWD', asOf: isoTwseDate(row.Date), sourceId: 'twse-openapi-v1' }))
  } catch { errors.push({ message: '臺灣證券交易所行情暫時無法取得。' }) }
  try {
    const response = await fetch(CBC_URL, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`CBC ${response.status}`)
    const body = await response.json()
    const rows = body.data.dataSets
    const row = rows[rows.length - 1]
    const ntdPerUsd = Number(row[1])
    const specs = [
      ['USD', 1, 'direct'], ['JPY', 2, 'divide'], ['GBP', 3, 'multiply'], ['HKD', 4, 'divide'], ['KRW', 5, 'divide'], ['CAD', 6, 'divide'], ['SGD', 7, 'divide'], ['CNY', 8, 'divide'], ['AUD', 9, 'multiply'], ['IDR', 10, 'divide'], ['THB', 11, 'divide'], ['MYR', 12, 'divide'], ['PHP', 13, 'divide'], ['EUR', 14, 'multiply'], ['VND', 18, 'divide'],
    ]
    rates = specs.flatMap(([currency, index, mode]) => {
      const raw = Number(row[index])
      if (!Number.isFinite(raw)) return []
      const rate = mode === 'direct' ? ntdPerUsd : mode === 'multiply' ? ntdPerUsd * raw : ntdPerUsd / raw
      return [{ fromCurrency: currency, toCurrency: 'TWD', rate: String(rate), asOf: isoCbcDate(row[0]), sourceId: 'cbc-bp01d01' }]
    })
  } catch { errors.push({ message: '中央銀行匯率暫時無法取得。' }) }
  return Response.json({ quotes, rates, errors, fetchedAt }, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
}
