import type { ProjectionResult } from '../domain/models'
import type { RebalancingResult } from '../domain/rebalancing-engine'

interface Props { portfolio: RebalancingResult | null; projection: ProjectionResult | null; years: number }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const labels: Record<string, string> = { stock: '股票', bond: '債券', moneyMarket: '貨幣市場', cash: '現金', other: '其他' }

export function PlanSummary({ portfolio, projection, years }: Props) {
  const balanced = projection?.scenarios.find((scenario) => scenario.id === 'balanced')?.milestones.find((item) => item.yearsFromNow === years)
  const total = portfolio?.allocations.reduce((sum, item) => sum + Number(item.valueTwd), 0) ?? 0
  const mainAllocation = portfolio?.allocations.filter((item) => Number(item.currentWeight) > 0).map((item) => `${labels[item.assetClass] ?? item.assetClass} ${(Number(item.currentWeight) * 100).toFixed(0)}%`).join('、')
  return <section className="panel plan-summary"><div className="panel-heading"><div><h2>我的規劃摘要</h2><p>以下是依目前已納入投資組合資料計算的結果，不是完整退休判斷。</p></div></div>{portfolio?.allocations.length ? <div className="summary-grid"><article><span>目前納入投資組合資產</span><strong>{currency.format(total)}</strong></article><article><span>主要資產配置</span><strong>{mainAllocation}</strong></article>{balanced && <><article><span>{years} 年後｜穩健情境</span><strong>{currency.format(Number(balanced.totalAssetsNominal))}</strong></article><article><span>同年份今天購買力</span><strong>{currency.format(Number(balanced.totalAssetsReal))}</strong></article></>}</div> : <div className="empty-state">尚未有可預測的投資組合。請先建立資產與配置，系統就會顯示未來資產摘要。</div>}</section>
}
