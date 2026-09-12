const STORAGE_KEY = 'retirement-planner-massive-api-key-v1'

export function getMassiveApiKey(): string {
  return localStorage.getItem(STORAGE_KEY)?.trim() ?? ''
}

export function setMassiveApiKey(value: string): void {
  const key = value.trim()
  if (key) localStorage.setItem(STORAGE_KEY, key)
  else localStorage.removeItem(STORAGE_KEY)
}

export function hasMassiveApiKey(): boolean {
  return Boolean(getMassiveApiKey())
}
