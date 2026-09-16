export function formatChineseAmount(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return ''
  if (val >= 100_000_000) {
    const yi = val / 100_000_000
    return `約 ${yi.toLocaleString('zh-TW', { maximumFractionDigits: 2 })} 億`
  }
  if (val >= 10_000) {
    const wan = val / 10_000
    return `約 ${wan.toLocaleString('zh-TW', { maximumFractionDigits: 2 })} 萬`
  }
  return `${val.toLocaleString('zh-TW')} 元`
}

export function formatWithCommas(digits: string): string {
  if (!digits) return ''
  const parts = digits.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

export function parseRaw(formatted: string): string {
  return formatted.replace(/,/g, '').trim()
}
