// Service worker do Check List (gerado no build a partir deste modelo – ver vite.config.ts).
// - Guarda o app inteiro no aparelho: abre e funciona sem internet.
// - Navegação: tenta a rede e, sem rede, usa o index.html guardado.
// - Arquivos do build (/assets/...): do cache primeiro (têm hash no nome).
// - Chamadas ao Supabase NÃO passam pelo cache (os dados offline ficam no IndexedDB).
const VERSAO = "__VERSAO__";
const ARQUIVOS = __ARQUIVOS__;
const CACHE = `checklist-${VERSAO}`;

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", ...ARQUIVOS]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("checklist-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase e outros: direto na rede

  if (req.mode === "navigate") {
    ev.respondWith(
      fetch(req).then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put("/index.html", copia));
        return r;
      }).catch(() => caches.match("/index.html").then((r) => r || caches.match("/"))),
    );
    return;
  }

  ev.respondWith(
    caches.match(req).then((r) => r || fetch(req).then((resp) => {
      if (resp.ok && url.pathname.startsWith("/assets/")) {
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
      }
      return resp;
    })),
  );
});
