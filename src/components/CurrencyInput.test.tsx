import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CurrencyInput } from './CurrencyInput'
import { formatChineseAmount } from './currency-utils'

afterEach(() => {
  cleanup()
})

describe('formatChineseAmount', () => {
  it('formats thousands correctly', () => {
    expect(formatChineseAmount(3000)).toBe('3,000 元')
    expect(formatChineseAmount(25000)).toBe('約 2.5 萬')
    expect(formatChineseAmount(1000000)).toBe('約 100 萬')
    expect(formatChineseAmount(25000000)).toBe('約 2,500 萬')
    expect(formatChineseAmount(120000000)).toBe('約 1.2 億')
  })

  it('handles zero or negative', () => {
    expect(formatChineseAmount(0)).toBe('')
    expect(formatChineseAmount(-100)).toBe('')
  })
})

describe('CurrencyInput', () => {
  it('formats commas on typing and displays chinese badge', () => {
    render(<CurrencyInput ariaLabel="金額" />)
    const input = screen.getByLabelText('金額') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1000000' } })
    expect(input.value).toBe('1,000,000')
    expect(screen.getByText('約 100 萬')).toBeInTheDocument()
  })

  it('supplies raw value to onChange', () => {
    let captured = ''
    render(<CurrencyInput ariaLabel="輸入金額" onChange={(val) => { captured = val }} />)
    const input = screen.getByLabelText('輸入金額')
    fireEvent.change(input, { target: { value: '25000' } })
    expect(captured).toBe('25000')
    expect(screen.getByText('約 2.5 萬')).toBeInTheDocument()
  })
})
