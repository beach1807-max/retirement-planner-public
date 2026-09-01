import sharp from 'sharp'

await Promise.all([
  sharp('public/pwa-icon.svg').resize(192, 192).png().toFile('public/pwa-192.png'),
  sharp('public/pwa-icon.svg').resize(512, 512).png().toFile('public/pwa-512.png'),
  sharp('public/pwa-icon-maskable.svg').resize(512, 512).png().toFile('public/pwa-maskable-512.png'),
])

console.log('PWA icons generated.')

