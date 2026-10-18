/* Service worker do Atas RPPS.
 * - Permite instalar o sistema como aplicativo (celular e computador).
 * - Guarda a "casca" do app para que ele abra mesmo sem rede (os trechos de áudio
 *   gravados ficam no IndexedDB e são enviados quando a conexão voltar).
 * - NUNCA guarda respostas da API (/api): dados da reunião vêm sempre do servidor.
 */
const CACHE = "atas-rpps-v1";
const SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return; // deixa o navegador tratar normalmente
  }

  // Páginas: rede primeiro (versão nova sempre que houver conexão), casca guardada se offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return resp;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Arquivos do build têm hash no nome: cache primeiro.
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((resp) => {
            if (resp.ok) {
              const copy = resp.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return resp;
          }),
      ),
    );
  }
});
