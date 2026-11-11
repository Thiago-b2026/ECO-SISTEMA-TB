// Topo igual ao do Gestão Salvados: botão "Eco Sistema TB" leva ao Portal.
// Menu só com as telas liberadas (minhas_telas('checklist')) e permitidas pelo perfil.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import {
  BarChart3, Briefcase, Building2, CalendarClock, ClipboardCheck, ClipboardList, FileSpreadsheet, LayoutList, LogOut, Menu, Network, Settings, Store, Users, Wrench, X,
} from "lucide-react";
import { useApp } from "../app/contexto";
import { MODO_DEMO } from "../data/conexao";
import { PERFIS } from "../data/servidor";
import { PORTAL_URL, TELAS_APP, telaDaRota } from "../lib/telas";
import { Aviso, cx } from "./base";

const ICONES: Record<string, typeof Store> = {
  "checklist.hoje": ClipboardCheck, "checklist.planos": Wrench, "checklist.loja": LayoutList, "checklist.dashboard": BarChart3,
  "checklist.relatorios": FileSpreadsheet, "checklist.agendamentos": CalendarClock, "checklist.modelos": ClipboardList, "checklist.equipe": Users,
  "checklist.empresas": Network,
};

export function AcessoNegado() {
  return (
    <div className="p-4">
      <Aviso tom="erro" titulo="Acesso negado">
        Você não tem permissão para esta tela. Peça ao administrador do Ecossistema TB para liberar no Portal.
      </Aviso>
    </div>
  );
}

/** Bloqueia a rota se a tela não estiver liberada. */
export function Guarda({ children }: { children: ReactNode }) {
  const { podeTela } = useApp();
  const { pathname } = useLocation();
  const tela = telaDaRota(pathname);
  if (tela && !podeTela(tela.codigo)) return <AcessoNegado />;
  return <>{children}</>;
}

export function Layout({ barraStatus }: { barraStatus?: ReactNode }) {
  const { sessao, admin, empresas, empresaAtual, setEmpresa, lojas, lojaAtual, setLojaAtual, perfil, podeTela, sair, liberadas, erroAcesso } = useApp();
  const [aberto, setAberto] = useState(false);
  // altura real do topo (1 ou 2 linhas + barra de status) → menu do celular e títulos fixos ficam logo abaixo
  const topo = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = topo.current;
    if (!el) return;
    const medir = () => document.documentElement.style.setProperty("--altura-topo", `${el.getBoundingClientRect().height}px`);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const telas = TELAS_APP.filter((t) => podeTela(t.codigo));
  // cadastros (configurações) primeiro no menu, para nunca ficarem escondidos no fim da lista
  // na ordem em que se configura: empresa e lojas → tarefas → agenda → colaboradores
  const ORDEM_CONFIG = ["checklist.empresas", "checklist.modelos", "checklist.agendamentos", "checklist.equipe"];
  const config = telas.filter((t) => t.grupo === "cadastros").sort((a, b) => ORDEM_CONFIG.indexOf(a.codigo) - ORDEM_CONFIG.indexOf(b.codigo));
  const diaADia = telas.filter((t) => t.grupo !== "cadastros");
  // barra de baixo: quem configura ganha o botão "Configurar" (abre o menu na seção de configurações)
  const principais = config.length ? diaADia.slice(0, 3) : diaADia.slice(0, 4);
  const colunas = principais.length + (config.length ? 1 : 0);
  const link = ({ isActive }: { isActive: boolean }) =>
    cx("flex min-h-12 items-center gap-2 rounded-lg px-3 font-medium", isActive ? "bg-marca-claro text-marca" : "text-gray-800 hover:bg-gray-100");

  return (
    <div className="flex min-h-full flex-col pb-20 lg:pb-0">
      <header ref={topo} className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        {/* No celular: linha 1 = marca + menu ☰ (sempre visível); linha 2 = empresa e unidade, cada uma com metade da largura.
            No computador (lg): tudo numa linha só. Nada sobrepõe nem empurra o menu para fora da tela. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 lg:flex-nowrap">
          <a href={PORTAL_URL} title="Ir para o Portal do Ecossistema TB" className="flex min-h-12 shrink-0 items-center gap-2 font-extrabold text-marca hover:underline">
            <Store className="size-5" aria-hidden /> <span className="whitespace-nowrap">Eco Sistema TB</span>
          </a>
          <span className="hidden text-sm text-gray-500 lg:inline">· Check List</span>
          <button onClick={() => setAberto((v) => !v)} className="order-2 ml-auto flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-lg hover:bg-gray-100 lg:order-none lg:hidden" aria-label="Menu" aria-expanded={aberto}>
            {aberto ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
          <div className="order-3 flex w-full min-w-0 items-center gap-2 lg:order-none lg:ml-auto lg:w-auto">
            {/* empresa escolhida: SEMPRE visível; seletor quando houver mais de uma (admin vê todas) */}
            {empresas.length > 1 ? (
              <label className="flex min-w-0 flex-1 items-center gap-1 text-sm lg:flex-none">
                <Briefcase className="size-4 shrink-0 text-gray-500" aria-hidden />
                <span className="sr-only">Empresa</span>
                <select value={empresaAtual?.rede_id ?? ""} onChange={(e) => setEmpresa(e.target.value)} className="min-h-10 w-full min-w-0 truncate rounded-lg border border-gray-300 px-2 text-sm font-semibold lg:w-56">
                  {empresas.map((e) => <option key={e.rede_id} value={e.rede_id}>{e.nome}</option>)}
                </select>
              </label>
            ) : empresaAtual && (
              <span className="flex min-w-0 flex-1 items-center gap-1 text-sm font-semibold text-gray-800 lg:flex-none"><Briefcase className="size-4 shrink-0 text-gray-500" aria-hidden /> <span className="truncate">{empresaAtual.nome}</span></span>
            )}
            {lojas.filter((l) => l.perfil).length > 1 ? (
              <label className="flex min-w-0 flex-1 items-center gap-1 text-sm lg:flex-none">
                <Building2 className="size-4 shrink-0 text-gray-500" aria-hidden />
                <span className="sr-only">Unidade</span>
                <select value={lojaAtual?.loja_id ?? ""} onChange={(e) => setLojaAtual(e.target.value)} className="min-h-10 w-full min-w-0 truncate rounded-lg border border-gray-300 px-2 text-sm lg:w-56">
                  {lojas.filter((l) => l.perfil).map((l) => <option key={l.loja_id} value={l.loja_id}>{l.nome}</option>)}
                </select>
              </label>
            ) : lojaAtual && <span className="flex min-w-0 flex-1 items-center gap-1 text-sm text-gray-700 lg:flex-none"><Building2 className="size-4 shrink-0 text-gray-500" aria-hidden /> <span className="truncate">{lojaAtual.nome}</span></span>}
          </div>
        </div>
        {barraStatus}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1">
        <nav aria-label="Menu" className={cx("fixed inset-x-0 top-[var(--altura-topo,120px)] bottom-16 z-20 overflow-y-auto border-b bg-white p-3 shadow-lg lg:static lg:bottom-auto lg:block lg:w-60 lg:shrink-0 lg:overflow-visible lg:border-0 lg:shadow-none", aberto ? "block" : "hidden")}>
          <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="font-semibold">{sessao?.nome}</div>
            <div className="text-gray-600">{admin ? "Admin do Ecossistema" : perfil ? PERFIS[perfil] : "Sem perfil nesta unidade"}{lojaAtual ? ` · ${lojaAtual.nome}` : ""}</div>
            {empresaAtual && <div className="text-gray-600">Empresa: <b>{empresaAtual.nome}</b></div>}
            {MODO_DEMO && <div className="mt-1 text-xs font-semibold text-amber-800">Modo demonstração</div>}
          </div>
          <ul className="space-y-1" onClick={() => setAberto(false)}>
            {config.length > 0 && (
              <>
                <li className="flex items-center gap-2 px-3 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-marca"><Settings className="size-4" aria-hidden /> Configurações</li>
                {config.map((t) => {
                  const I = ICONES[t.codigo] ?? ClipboardCheck;
                  return <li key={t.codigo}><NavLink to={t.rota} end={t.rota === "/"} className={link}><I className="size-5" aria-hidden /> {t.nome}</NavLink></li>;
                })}
                <li className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-gray-500">Dia a dia</li>
              </>
            )}
            {diaADia.map((t) => {
              const I = ICONES[t.codigo] ?? ClipboardCheck;
              return <li key={t.codigo}><NavLink to={t.rota} end={t.rota === "/"} className={link}><I className="size-5" aria-hidden /> {t.nome}</NavLink></li>;
            })}
            <li>
              <button onClick={sair} className="flex min-h-12 w-full items-center gap-2 rounded-lg px-3 font-medium text-gray-800 hover:bg-gray-100">
                <LogOut className="size-5" aria-hidden /> Sair
              </button>
            </li>
          </ul>
        </nav>

        <main className="min-w-0 flex-1 p-3 sm:p-4">
          {liberadas === null && (
            <div className="mb-3">
              <Aviso tom="alerta" titulo="Não foi possível conferir as permissões">
                O menu está usando só o seu perfil. {erroAcesso ? `(${erroAcesso})` : ""}
              </Aviso>
            </div>
          )}
          {!empresaAtual ? (
            <div className="mb-3">
              <Aviso tom="alerta" titulo="Você ainda não está em nenhuma empresa">
                {admin ? "Cadastre a primeira empresa em Empresas e lojas." : "Peça ao gestor para incluir você na equipe de uma unidade (tela Colaboradores)."}
              </Aviso>
            </div>
          ) : !lojas.some((l) => l.perfil) && (
            <div className="mb-3">
              <Aviso tom="alerta" titulo={`${empresaAtual.nome}: nenhuma unidade usando o Check List`}>
                {admin ? "Cadastre a matriz e as filiais em Empresas e lojas (marcando “usa o Check List”)." : "Peça ao gestor para incluir você na equipe de uma unidade."}
              </Aviso>
            </div>
          )}
          <Guarda><Outlet /></Guarda>
        </main>
      </div>

      {/* barra inferior no celular */}
      <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-white lg:hidden" style={{ gridTemplateColumns: `repeat(${Math.max(colunas, 1)}, minmax(0, 1fr))` }}>
        {principais.map((t) => {
          const I = ICONES[t.codigo] ?? ClipboardCheck;
          return (
            <NavLink key={t.codigo} to={t.rota} end={t.rota === "/"} className={({ isActive }) => cx("flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs", isActive ? "font-bold text-marca" : "text-gray-700")}>
              <I className="size-6" aria-hidden /> {t.nome.split(" ")[0]}
            </NavLink>
          );
        })}
        {config.length > 0 && (
          <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className={cx("flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs", aberto ? "font-bold text-marca" : "text-gray-700")}>
            <Settings className="size-6" aria-hidden /> Configurar
          </button>
        )}
      </nav>
    </div>
  );
}
