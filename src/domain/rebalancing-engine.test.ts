import { describe, expect, it } from 'vitest'
import { calculateRebalancing } from './rebalancing-engine'

describe('Rebalancing Engine', () => {
  it('在範圍內顯示正常，超出範圍給出可解釋提醒', () => {
    const balanced = calculateRebalancing({ allocations: [{ assetClass: 'stockEtf', valueTwd: '60' }, { assetClass: 'bond', valueTwd: '40' }], targets: [{ assetClass: 'stockEtf', targetWeight: '0.6' }, { assetClass: 'bond', targetWeight: '0.4' }], driftThreshold: '0.05' })
    expect(balanced.status).toBe('balanced')
    const drifted = calculateRebalancing({ allocations: [{ assetClass: 'stockEtf', valueTwd: '80' }, { assetClass: 'bond', valueTwd: '20' }], targets: [{ assetClass: 'stockEtf', targetWeight: '0.6' }, { assetClass: 'bond', targetWeight: '0.4' }], driftThreshold: '0.05' })
    expect(drifted.status).toBe('reviewNeeded')
    expect(drifted.warnings[0]).toContain('20.0 個百分點')
  })

  it('零資產不製造比例，負市值與非 100% 目標會拒絕', () => {
    expect(calculateRebalancing({ allocations: [], targets: [{ assetClass: 'cash', targetWeight: '1' }], driftThreshold: '0.05' }).status).toBe('empty')
    expect(() => calculateRebalancing({ allocations: [{ assetClass: 'cash', valueTwd: '-1' }], targets: [{ assetClass: 'cash', targetWeight: '1' }], driftThreshold: '0.05' })).toThrow('INVALID_ALLOCATION_VALUE')
    expect(() => calculateRebalancing({ allocations: [], targets: [{ assetClass: 'cash', targetWeight: '.9' }], driftThreshold: '0.05' })).toThrow('INVALID_TARGET_TOTAL')
  })
})
