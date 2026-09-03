export async function resetAppCache(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if ('caches' in globalThis) {
    const cacheNames = await globalThis.caches.keys()
    await Promise.all(cacheNames.map((cacheName) => globalThis.caches.delete(cacheName)))
  }
}
