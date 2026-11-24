// Service worker – nhận Push Notification từ Firebase Cloud Messaging và hiện trên màn hình khoá
// Cấu hình Firebase được điền khi đóng gói (gas/build.js)
const FCM_CONFIG = {"apiKey":"AIzaSyDQsPjB3wHS0L2BNA70kwq_UICFQHmGua4","authDomain":"bvg-hrm.firebaseapp.com","projectId":"bvg-hrm","storageBucket":"bvg-hrm.firebasestorage.app","messagingSenderId":"506413332895","appId":"1:506413332895:web:8f8051c62e7acd1fb625aa"};
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp(FCM_CONFIG);
const messaging = firebase.messaging();

// Tin dạng "data" (không kèm notification) → tự hiện
messaging.onBackgroundMessage(p => {
  if (p.notification) return;               // tin có notification: trình duyệt / Firebase tự hiện
  const d = p.data || {};
  return self.registration.showNotification(d.title || 'BV Group', {
    body: d.body || '', icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: d.tag || undefined, data: { link: d.link || './nhan-vien.html' }
  });
});

// Bấm vào thông báo → mở / chuyển về app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {}, fcm = d.FCM_MSG || {};
  const link = d.link || (fcm.data && fcm.data.link) || (fcm.notification && fcm.notification.click_action) || './nhan-vien.html';
  const url = new URL(link, self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope)) { if ('navigate' in w && w.url !== url) w.navigate(url); return w.focus(); }
    return clients.openWindow(url);
  }));
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
