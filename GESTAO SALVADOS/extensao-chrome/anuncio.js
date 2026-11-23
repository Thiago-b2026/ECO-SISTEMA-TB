// Roda nas páginas do Mercado Livre. Só faz algo nas abas que o PDV abriu:
//  - "pdv-captura|<PDV>": página de UM anúncio (busca por link) → lê nome, preço, preço anterior, foto, marca e fecha a aba;
//  - "pdv-busca|<PDV>": aba do ROBÔ da planilha, na página de BUSCA do site → lê a lista de resultados e devolve
//    (a aba continua aberta; o PDV leva ela para a próxima busca).
// Nas outras abas, não faz nada. Os dados vêm do que a própria página publica (dados estruturados).
(function () {
  var nome = String(window.name || "");
  if (nome.indexOf("pdv-busca|") === 0) return buscaDoRobo(nome.slice("pdv-busca|".length));
  if (nome.indexOf("pdv-captura|") !== 0) return;
  var origemPdv = nome.slice("pdv-captura|".length);
  if (!/^https:\/\/eco-sistema-tb\.vercel\.app$|^http:\/\/localhost:5173$/.test(origemPdv)) return;

  function produtoLd() {
    var achado = null;
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
      try {
        var j = JSON.parse(s.textContent);
        (Array.isArray(j) ? j : [j]).forEach(function (x) {
          if (x && x["@type"] === "Product" && !achado) achado = x;
        });
      } catch (e) {}
    });
    return achado;
  }
  function meta(n) {
    var e = document.querySelector('meta[property="' + n + '"],meta[name="' + n + '"],meta[itemprop="' + n + '"]');
    return e ? e.content : null;
  }
  function numero(t) {
    if (t == null || t === "") return null;
    if (typeof t === "number") return t;
    var r = String(t).match(/(\d[\d.]*)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?/);
    if (r) return Number(r[1].replace(/\./g, "")) + (r[2] ? Number(r[2]) / 100 : 0);
    var n = Number(String(t).replace(",", "."));
    return isFinite(n) ? n : null;
  }
  function ler() {
    var ld = produtoLd();
    if (!ld) return null;
    var o = ld.offers ? (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers) : {};
    var ant = document.querySelector(".ui-pdp-price__original-value, s.andes-money-amount");
    var img = ld.image ? (Array.isArray(ld.image) ? ld.image[0] : ld.image) : meta("og:image");
    var bc = [].slice.call(document.querySelectorAll(".andes-breadcrumb__item a")).map(function (a) { return a.textContent.trim(); }).filter(Boolean);
    var u = location.href;
    var w = (u.match(/item_id(?:%3A|:|=)(MLB-?\d+)/i) || u.match(/\/(MLB-\d{6,})/i) || u.match(/\/p\/(MLB\d+)/i) || [])[1];
    return {
      titulo: ld.name || (document.querySelector("h1") || {}).textContent || meta("og:title"),
      preco: numero(o && o.price != null ? o.price : meta("price")),
      preco_original: numero(ant && ant.getAttribute("aria-label")),
      foto: img || null,
      link: u.split("#")[0],
      id: w ? w.replace("-", "").toUpperCase() : ld.sku || null,
      marca: ld.brand ? ld.brand.name || ld.brand : null,
      gtin: ld.gtin13 || ld.gtin || ld.gtin8 || ld.gtin12 || null,
      categoria: bc.length ? bc[bc.length - 1] : null,
    };
  }
  function enviar(msg) {
    var mensagem = Object.assign({ tipo: "salvados-captura" }, msg);
    if (window.opener) {
      try {
        window.opener.postMessage(mensagem, origemPdv);
        return true;
      } catch (e) {}
    }
    if (msg.dados) {
      // sem a aba do PDV por perto: entrega pela página /capturar (guarda no navegador)
      location.href = origemPdv + "/capturar#" + encodeURIComponent(JSON.stringify(msg.dados));
      return false;
    }
    return false;
  }

  // A página do anúncio pode demorar a montar: tenta por até 15 s.
  var inicio = Date.now();
  (function tentar() {
    var dados = ler();
    if (dados && dados.titulo) {
      if (enviar({ dados: dados })) {
        window.name = "";
        setTimeout(function () { window.close(); }, 300);
      }
      return;
    }
    if (Date.now() - inicio < 15000) return setTimeout(tentar, 500);
    // Não é página de anúncio (ou o ML pediu verificação): deixa a aba aberta para a pessoa ver e avisa o PDV.
    enviar({ erro: "Não consegui ler o anúncio nesta aba. Confira a aba do Mercado Livre que abriu." });
  })();
})();

// ---------------------------------------------------------------- busca do robô (página de resultados)
function buscaDoRobo(origemPdv) {
  if (!/^https:\/\/eco-sistema-tb\.vercel\.app$|^http:\/\/localhost:5173$/.test(origemPdv)) return;
  function numero(t) {
    if (t == null || t === "") return null;
    if (typeof t === "number") return t;
    var r = String(t).match(/(\d[\d.]*)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?/);
    if (r) return Number(r[1].replace(/\./g, "")) + (r[2] ? Number(r[2]) / 100 : 0);
    var n = Number(String(t).replace(",", "."));
    return isFinite(n) ? n : null;
  }
  function limpaLink(u) { return String(u || "").split("#")[0].split("?")[0]; }
  function idDoLink(u) {
    var m = u.match(/\/(MLBU\d+)/i) || u.match(/\/p\/(MLB\d+)/i) || u.match(/\/(MLB)-?(\d{6,})/i);
    if (!m) return null;
    return m[2] ? ("MLB" + m[2]) : m[1].toUpperCase();
  }
  function lerResultados() {
    var grafo = null;
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
      try { var j = JSON.parse(s.textContent); if (j && j["@graph"] && !grafo) grafo = j["@graph"]; } catch (e) {}
    });
    if (!grafo) return null;
    // preço "de" (riscado) vem só nos cartões da página: junta pelo link
    var precoDe = {};
    document.querySelectorAll(".poly-card, .ui-search-layout__item").forEach(function (card) {
      var a = card.querySelector("a.poly-component__title, h2 a, h3 a, a");
      var s = card.querySelector("s .andes-money-amount, s.andes-money-amount, .andes-money-amount--previous");
      if (a && s) precoDe[limpaLink(a.href)] = numero(s.getAttribute("aria-label"));
    });
    var vistos = {};
    var lista = [];
    grafo.forEach(function (p) {
      if (!p || p["@type"] !== "Product" || !p.name) return;
      var o = Array.isArray(p.offers) ? p.offers[0] : p.offers || {};
      var link = limpaLink(o.url || p.url);
      if (!link || vistos[link]) return;
      vistos[link] = true;
      lista.push({
        id: idDoLink(link),
        titulo: p.name,
        preco: numero(o.price),
        preco_original: precoDe[link] || null,
        foto: Array.isArray(p.image) ? p.image[0] : p.image || null,
        link: link,
        marca: p.brand ? p.brand.name || p.brand : null,
      });
    });
    return lista.slice(0, 20);
  }
  function enviar(msg) {
    if (!window.opener) return;
    try { window.opener.postMessage(Object.assign({ tipo: "salvados-busca", pagina: location.pathname }, msg), origemPdv); } catch (e) {}
  }
  var inicio = Date.now();
  (function tentar() {
    var r = lerResultados();
    if (r) return enviar({ resultados: r });
    // página "não encontramos" também é resposta (lista vazia)
    if (document.querySelector(".ui-search-rescue, .ui-search-rescue__title")) return enviar({ resultados: [] });
    if (Date.now() - inicio < 15000) return setTimeout(tentar, 500);
    // sem resultados nem aviso: provavelmente o ML pediu verificação. Não contorna: avisa o PDV e a pessoa resolve na aba.
    enviar({ erro: "verificacao" });
  })();
}

