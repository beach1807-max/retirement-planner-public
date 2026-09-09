import Decimal from 'decimal.js'
import type { MoneyAmount, PlannerData } from './planner-data'

export function exchangeRateFor(data: PlannerData, currency: string) {
  return data.exchangeRates.filter((rate) => rate.fromCurrency === currency && rate.toCurrency === 'TWD' && new Decimal(rate.rate).isFinite() && new Decimal(rate.rate).gt(0))
    .sort((a, b) => b.asOf.localeCompare(a.asOf) || b.fetchedAt.localeCompare(a.fetchedAt))[0]
}

/** 原幣金額只在計算邊界換算一次；缺少匯率不可當成零元或台幣。 */
export function moneyToTwd(data: PlannerData, money: MoneyAmount): Decimal | null {
  if (money.currency === 'TWD') return new Decimal(money.amount)
  const rate = exchangeRateFor(data, money.currency)
  return rate ? new Decimal(money.amount).mul(rate.rate) : null
}

export function formatMoney(money: MoneyAmount): string {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: money.currency, currencyDisplay: 'code', maximumFractionDigits: 2 }).format(Number(money.amount))
}
