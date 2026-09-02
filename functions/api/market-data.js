const TWSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
const CBC_URL = 'https://cpx.cbc.gov.tw/api/OpenData/FTDOpenData_Day'

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
    const rows = await response.json()
    const row = rows[rows.length - 1]
    const rate = Number(row.NTD_USD)
    if (!Number.isFinite(rate)) throw new Error('CBC invalid rate')
    rates = [{ fromCurrency: 'USD', toCurrency: 'TWD', rate: String(rate), asOf: isoCbcDate(row['日期']), sourceId: 'cbc-ftd-day' }]
  } catch { errors.push({ message: '中央銀行匯率暫時無法取得。' }) }
  return Response.json({ quotes, rates, errors, fetchedAt }, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
}
