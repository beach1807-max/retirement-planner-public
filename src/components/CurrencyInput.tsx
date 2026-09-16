import { useState, useId, type ChangeEvent } from 'react'
import { formatChineseAmount, formatWithCommas, parseRaw } from './currency-utils'

interface Props {
  id?: string
  name?: string
  value?: string | number
  defaultValue?: string | number
  placeholder?: string
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
  className?: string
  ariaLabel?: string
  onChange?: (rawValue: string) => void
}

export function CurrencyInput({
  id,
  name,
  value,
  defaultValue,
  placeholder,
  required,
  disabled,
  readOnly,
  className = '',
  ariaLabel,
  onChange,
}: Props) {
  const autoId = useId()
  const inputId = id ?? `currency-input-${autoId.replaceAll(':', '')}`
  const isControlled = value !== undefined
  const [internalRaw, setInternalRaw] = useState(() => parseRaw(String(defaultValue ?? '')))

  const raw = isControlled ? parseRaw(String(value ?? '')) : internalRaw
  const displayValue = formatWithCommas(raw)

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const nextRaw = parseRaw(e.target.value)
    if (nextRaw !== '' && !/^\d*\.?\d*$/.test(nextRaw)) {
      return
    }

    if (!isControlled) {
      setInternalRaw(nextRaw)
    }
    onChange?.(nextRaw)
  }

  const numVal = Number(raw)
  const chineseHint = raw && Number.isFinite(numVal) && numVal > 0 ? formatChineseAmount(numVal) : ''

  return (
    <div className={`currency-input-container ${className}`}>
      <div className="currency-input-field-wrap">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          aria-label={ariaLabel}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          value={displayValue}
          onChange={handleChange}
          className="currency-input-element"
        />
        {name && <input type="hidden" name={name} value={raw} />}
      </div>
      {chineseHint && (
        <span className="currency-chinese-badge" aria-live="polite">
          {chineseHint}
        </span>
      )}
    </div>
  )
}
