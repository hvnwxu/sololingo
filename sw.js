// SOLOLINGO 서비스 워커: 앱을 설치 가능하게 하고, 한 번 연 뒤에는 빠르게 열리도록 파일을 저장해 둡니다.
const CACHE_NAME = 'sololingo-v9';
const APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/theme.js',
  './js/config.js',
  './js/storage.js',
  './js/state.js',
  './js/utils.js',
  './js/coach.js',
  './js/camera.js',
  './js/counter.js',
  './js/workout.js',
  './js/game.js',
  './js/ui.js',
  './js/pwa.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // AI 모델 파일(버전 고정)은 한 번 받으면 저장해 두고 재사용 → 두 번째부터 빨리 켜짐
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  // 앱 파일은 최신 버전을 먼저 시도하고, 인터넷이 없으면 저장된 버전을 사용
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
  }
});
