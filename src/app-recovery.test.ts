import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetAppCache } from './app-recovery'

describe('應用程式快取復原', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('只解除 Service Worker 並刪除 Cache Storage', async () => {
    const unregister = vi.fn().mockResolvedValue(true)
    const deleteCache = vi.fn().mockResolvedValue(true)
    const indexedDBDelete = vi.spyOn(indexedDB, 'deleteDatabase')
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) } })
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['workbox-precache']), delete: deleteCache })

    await resetAppCache()

    expect(unregister).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache')
    expect(indexedDBDelete).not.toHaveBeenCalled()
    indexedDBDelete.mockRestore()
  })
})
