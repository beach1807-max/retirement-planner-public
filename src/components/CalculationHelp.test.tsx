import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CalculationHelp } from './CalculationHelp'

describe('計算規則說明', () => {
  it('點擊問號顯示公式，按 Escape 關閉', async () => {
    const user = userEvent.setup()
    render(<CalculationHelp label="今天購買力" topic="purchasingPower" />)

    const trigger = screen.getByRole('button', { name: '說明：今天購買力' })
    await user.click(trigger)

    expect(screen.getByRole('dialog', { name: '今天購買力計算說明' })).toBeVisible()
    expect(screen.getByText(/未來名目金額 ÷/)).toBeVisible()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('一次只開啟一個說明，點擊外部可關閉', async () => {
    const user = userEvent.setup()
    render(<div data-testid="outside"><CalculationHelp topic="nominalValue" /><CalculationHelp topic="inflation" /></div>)

    await user.click(screen.getByRole('button', { name: '說明：名目金額' }))
    await user.click(screen.getByRole('button', { name: '說明：年化通膨率' }))
    expect(screen.queryByRole('dialog', { name: '名目金額計算說明' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '年化通膨率計算說明' })).toBeVisible()

    fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
