// ===== Service Worker: ระบบความปลอดภัยบนท้องถนน - ภาคตะวันออก =====
const CACHE_NAME = 'road-safety-east-v11';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ติดตั้ง service worker และ cache หน้าเว็บหลักไว้ล่วงหน้า (ไว้ใช้ตอนออฟไลน์เท่านั้น)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  // 🆕 บังคับให้เวอร์ชันใหม่ activate ทันที ไม่ต้องรอผู้ใช้กดยืนยัน
  self.skipWaiting();
});

// รองรับคำสั่งจากหน้าเว็บเผื่อยังมีโค้ดเก่าเรียกอยู่ (ไม่มีผลเสีย ปลอดภัยไว้)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ลบ cache เวอร์ชันเก่าเมื่อมีเวอร์ชันใหม่ + เข้าควบคุมหน้าเว็บที่เปิดอยู่ทันที
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// กลยุทธ์:
//  - หน้าเว็บ (HTML/นำทาง): Network First — ดึงของสดจากเน็ตก่อนเสมอ ถ้าออฟไลน์ค่อย fallback ไป cache
//  - API ภายนอก (Google Apps Script): ดึงสดเสมอเช่นกัน
//  - ไฟล์ประกอบอื่นๆ ของแอป (manifest, icons): cache ก่อน เน็ตทีหลัง (เปลี่ยนไม่บ่อย ไม่จำเป็นต้องเช็คทุกครั้ง)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // คำขอไปยัง Google Apps Script / API ภายนอก
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 🆕 หน้าเว็บหลัก (การนำทาง/โหลด/รีเฟรชหน้า) — ดึงสดจากเน็ตก่อนเสมอ
  // เพื่อให้เปิดแอปแล้วเจอเวอร์ชันล่าสุดทันที ไม่ต้องรอกดปุ่มอัปเดตอีกต่อไป
  const isDocument = event.request.mode === 'navigate' || event.request.destination === 'document';
  if (isDocument) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // ไฟล์ประกอบอื่นๆ ของแอปเอง: cache ก่อน เน็ตทีหลัง
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
