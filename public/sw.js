// 2026/9/6新設: 「ホーム画面に追加(PWA化)」のためだけの最小構成のService Worker。
// このアプリは日々内容が更新されるため、あえてオフラインキャッシュ等の複雑なことは行わず、
// 常にネットワークからそのまま取得する(インストール可能にするための最低限の登録のみ)。
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return; // POST等は素通り(ブラウザの標準動作に任せる)
  event.respondWith(fetch(event.request));
});
