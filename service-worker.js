// ===== Service Worker: ระบบความปลอดภัยบนท้องถนน - ภาคตะวันออก =====
const CACHE_NAME = 'road-safety-east-v10';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ติดตั้ง service worker และ cache หน้าเว็บหลักไว้ล่วงหน้า
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  // หมายเหตุ: ไม่เรียก skipWaiting() ที่นี่ตั้งใจ — ให้ service worker ใหม่รอจนกว่า
  // ผู้ใช้จะกดยืนยัน "อัปเดตตอนนี้" ในหน้าเว็บ (ดู applyAppUpdate() ใน index.html)
});

// รับคำสั่งจากหน้าเว็บให้ activate เวอร์ชันใหม่ทันที
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ลบ cache เวอร์ชันเก่าเมื่อมีเวอร์ชันใหม่
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// กลยุทธ์: Network first สำหรับ API/ข้อมูล, Cache first สำหรับไฟล์แอปเอง
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // อย่า cache คำขอไปยัง Google Apps Script / API ภายนอก — ให้ดึงสดเสมอ
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // ไฟล์ของแอปเอง: ลอง cache ก่อน ถ้าไม่มีค่อยไปดึงจากเน็ต แล้วเก็บ cache ไว้ใช้ครั้งถัดไป
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
