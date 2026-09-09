import type { ProjectionMilestone } from '../domain/models'
import type { RebalancingResult } from '../domain/rebalancing-engine'

interface Props { portfolio: RebalancingResult | null; milestone?: Omit<ProjectionMilestone, 'yearsFromNow'>; timeLabel: string }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
const labels: Record<string, string> = { stock: '股票', bond: '債券', moneyMarket: '貨幣市場', cash: '現金', other: '其他' }

export function PlanSummary({ portfolio, milestone, timeLabel }: Props) {
  const total = portfolio?.allocations.reduce((sum, item) => sum + Number(item.valueTwd), 0) ?? 0
  const mainAllocation = portfolio?.allocations.filter((item) => Number(item.currentWeight) > 0).map((item) => `${labels[item.assetClass] ?? item.assetClass} ${(Number(item.currentWeight) * 100).toFixed(0)}%`).join('、')
  return <section className="panel plan-summary"><div className="panel-heading"><div><h2>我的規劃摘要</h2><p>以下依目前納入的投資組合與上方所選時間呈現，不是完整退休判斷。</p></div></div>{portfolio?.allocations.length ? <div className="summary-grid"><article><span>目前納入投資組合資產</span><strong>{currency.format(total)}</strong></article><article><span>主要資產配置</span><strong>{mainAllocation}</strong></article>{milestone && <><article><span>{timeLabel}｜穩健情境名目資產</span><strong>{currency.format(Number(milestone.totalAssetsNominal))}</strong></article><article><span>相當於今天購買力</span><strong>{currency.format(Number(milestone.totalAssetsReal))}</strong></article></>}</div> : <div className="empty-state">尚未有可預測的投資組合。請先建立資產與配置，系統就會顯示未來資產摘要。</div>}</section>
}
