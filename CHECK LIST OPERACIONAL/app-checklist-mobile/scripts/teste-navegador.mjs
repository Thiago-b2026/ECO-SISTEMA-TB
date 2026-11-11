// Teste no Chrome de verdade (sem janela). Passo a passo:
//  1) VITE_MODO_DEMO=1 npm run build && npx vite preview --port 5197
//  2) chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<pasta-temporaria> about:blank
//  3) node scripts/teste-navegador.mjs http://localhost:5197/ <pasta-saida> demo|offline|erro
//     (modo erro: build SEM VITE_MODO_DEMO e sem .env → deve mostrar "Erro de configuração")
// Teste no NAVEGADOR DE VERDADE (Chrome sem janela, via protocolo de depuração).
// Uso: node navegador.mjs <url> <pasta-saida> [modo]   modo = "demo" (percorre usuários e rotas) | "erro" (só a tela de erro)
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , URL_APP, SAIDA, MODO = "demo"] = process.argv;
const PORTA = 9333;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const alvo = await (await fetch(`http://127.0.0.1:${PORTA}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener("open", ok, { once: true }));
let n = 0;
const pendentes = new Map();
const erros = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id); return; }
  if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "assert")) {
    erros.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
  }
  if (m.method === "Runtime.exceptionThrown") erros.push(`exceção: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") erros.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`);
});
const cdp = (method, params = {}) => new Promise((ok) => { const id = ++n; pendentes.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const js = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const foto = async (nome) => {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SAIDA, `${nome}.png`), Buffer.from(r.result.data, "base64"));
};
const esperarTexto = async (re, ms = 8000) => {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (new RegExp(re).test((await js("document.body.innerText")) ?? "")) return true; await espera(200); }
  return false;
};

await cdp("Runtime.enable");
await cdp("Log.enable");
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); // celular
await cdp("Page.navigate", { url: URL_APP });
await espera(2500);

const resultado = { modo: MODO, telas: {}, erros: [] };

if (MODO === "offline") {
  await espera(3000); // service worker instala e guarda os arquivos
  resultado.swAtivo = await js(`navigator.serviceWorker.getRegistration().then((r) => !!r?.active)`);
  await cdp("Network.enable");
  await cdp("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp("Page.reload", { ignoreCache: false });
  await espera(3000);
  resultado.abriuSemInternet = await esperarTexto("Eco Sistema TB");
  resultado.temLoginOuApp = /Entrar|Minhas tarefas|Sair/.test(await js("document.body.innerText"));
  await foto("offline");
} else if (MODO === "erro") {
  resultado.telaErro = await esperarTexto("Erro de configuração");
  resultado.temDemo = /Modo demonstração/.test(await js("document.body.innerText"));
  await foto("erro-configuracao");
} else {
  await foto("login");
  const PESSOAS = ["Admin (Ecossistema TB)", "Ana (Fiscal – Matriz)", "Bruno (Líder – Matriz)", "Carla (Gestora)", "Diego (Fiscal – Filial)", "Elisa (Líder – Filial)", "Gabriel (Gestor – Exemplo 2)"];
  const ROTAS = ["/", "/planos", "/loja", "/dashboard", "/relatorios", "/agendamentos", "/modelos", "/equipe", "/empresas"];
  for (const p of PESSOAS) {
    await js(`localStorage.removeItem("checklist-demo-sessao"); history.pushState({}, "", "/"); location.reload();`);
    await espera(2000);
    const clicou = await js(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.innerText.includes(${JSON.stringify(p)})); if (b) b.click(); return !!b; })()`);
    if (!clicou) { erros.push(`não achou o botão de ${p}`); continue; }
    await esperarTexto("Sair");
    resultado.telas[p] = {};
    for (const r of ROTAS) {
      await js(`history.pushState({}, "", ${JSON.stringify(r)}); dispatchEvent(new PopStateEvent("popstate"));`);
      await espera(1300);
      const texto = (await js(`document.querySelector("main")?.innerText ?? ""`)) ?? "";
      const alertas = await js(`[...document.querySelectorAll("main [role=alert]")].map((a) => a.innerText).filter((t) => !/Acesso negado/.test(t))`);
      resultado.telas[p][r] = /Acesso negado/.test(texto) ? "negado" : alertas?.length ? `ALERTA: ${alertas.join(" | ").slice(0, 120)}` : /Carregando/.test(texto) ? "carregando" : "ok";
      if (p.startsWith("Gabriel") && /Supermix|SUPERMIX|Fiscal de caixa/.test(await js("document.body.innerText"))) erros.push(`Gabriel viu Supermix em ${r}`);
    }
    if (p.startsWith("Admin")) {
      await js(`history.pushState({}, "", "/modelos"); dispatchEvent(new PopStateEvent("popstate"));`);
      await espera(1500);
      await foto("admin-modelos");
      await js(`history.pushState({}, "", "/empresas"); dispatchEvent(new PopStateEvent("popstate"));`);
      await espera(1500);
      await foto("admin-empresas");
      await js(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "Configurar"); b?.click(); })()`);
      await espera(600);
      await foto("admin-menu-configurar");
      resultado.topoCelular = await js(`(() => {
        const b = document.querySelector('button[aria-label="Menu"]').getBoundingClientRect();
        const e = document.querySelector('select')?.getBoundingClientRect();
        const sels = [...document.querySelectorAll("header select")].map((x) => x.getBoundingClientRect());
        const sobrepoe = sels.length === 2 && !(sels[0].right <= sels[1].left || sels[1].right <= sels[0].left || sels[0].bottom <= sels[1].top || sels[1].bottom <= sels[0].top);
        return { menuDentroDaTela: b.right <= innerWidth && b.left >= 0, larguraTela: innerWidth, seletoresSobrepostos: sobrepoe, alturaTopo: getComputedStyle(document.documentElement).getPropertyValue("--altura-topo") };
      })()`);
    }
    if (p.startsWith("Ana")) {
      await js(`history.pushState({}, "", "/"); dispatchEvent(new PopStateEvent("popstate"));`);
      await espera(1500);
      await foto("ana-minhas-tarefas");
      await js(`(() => { const b = [...document.querySelectorAll("button")].find((x) => /Iniciar|Continuar/.test(x.innerText)); b?.click(); })()`);
      await espera(1800);
      await foto("ana-execucao");
    }
  }
  resultado.serviceWorker = await js(`navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : -1`);
}
resultado.erros = [...erros];
writeFileSync(join(SAIDA, "resultado.json"), JSON.stringify(resultado, null, 2));
console.log(JSON.stringify(resultado, null, 2));
await cdp("Page.close").catch(() => {});
ws.close();
process.exit(0);
