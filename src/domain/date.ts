const MONTH_PATTERN = /^(\d{4})-(\d{2})(?:-\d{2})?$/

export function toMonth(value: string): string {
  const match = MONTH_PATTERN.exec(value)
  if (!match) throw new Error(`無效日期：${value}`)
  const month = Number(match[2])
  if (month < 1 || month > 12) throw new Error(`無效月份：${value}`)
  return `${match[1]}-${match[2]}`
}

export function monthIndex(value: string): number {
  const [year, month] = toMonth(value).split('-').map(Number)
  return year * 12 + month - 1
}

export function fromMonthIndex(value: number): string {
  const year = Math.floor(value / 12)
  const month = (value % 12) + 1
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`
}

export function addMonths(value: string, count: number): string {
  return fromMonthIndex(monthIndex(value) + count)
}

export function monthsBetween(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from)
}

export function isMonthBetween(value: string, start: string, end: string): boolean {
  const current = monthIndex(value)
  return current >= monthIndex(start) && current <= monthIndex(end)
}

