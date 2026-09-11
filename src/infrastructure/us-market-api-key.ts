const STORAGE_KEY = 'retirement-planner-us-eod-api-key-v1'

export function getUsMarketApiKey(): string {
  return localStorage.getItem(STORAGE_KEY)?.trim() ?? ''
}

export function setUsMarketApiKey(value: string): void {
  const key = value.trim()
  if (key) localStorage.setItem(STORAGE_KEY, key)
  else localStorage.removeItem(STORAGE_KEY)
}

export function hasUsMarketApiKey(): boolean {
  return Boolean(getUsMarketApiKey())
}
