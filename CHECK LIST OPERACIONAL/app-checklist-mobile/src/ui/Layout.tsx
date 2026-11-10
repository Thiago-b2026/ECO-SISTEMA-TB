// Topo igual ao do Gestão Salvados: botão "Eco Sistema TB" leva ao Portal.
// Menu só com as telas liberadas (minhas_telas('checklist')) e permitidas pelo perfil.
import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import {
  BarChart3, Building2, CalendarClock, ClipboardCheck, ClipboardList, FileSpreadsheet, LayoutList, LogOut, Menu, Store, Users, Wrench, X,
} from "lucide-react";
import { useApp } from "../app/contexto";
import { MODO_DEMO } from "../data/conexao";
import { PERFIS } from "../data/servidor";
import { PORTAL_URL, TELAS_APP, telaDaRota } from "../lib/telas";
import { Aviso, cx } from "./base";

const ICONES: Record<string, typeof Store> = {
  "checklist.hoje": ClipboardCheck, "checklist.planos": Wrench, "checklist.loja": LayoutList, "checklist.dashboard": BarChart3,
  "checklist.relatorios": FileSpreadsheet, "checklist.agendamentos": CalendarClock, "checklist.modelos": ClipboardList, "checklist.equipe": Users,
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
  const { sessao, lojas, lojaAtual, setLojaAtual, perfil, podeTela, sair, liberadas, erroAcesso } = useApp();
  const [aberto, setAberto] = useState(false);
  const telas = TELAS_APP.filter((t) => podeTela(t.codigo));
  const principais = telas.slice(0, 4);
  const link = ({ isActive }: { isActive: boolean }) =>
    cx("flex min-h-12 items-center gap-2 rounded-lg px-3 font-medium", isActive ? "bg-marca-claro text-marca" : "text-gray-800 hover:bg-gray-100");

  return (
    <div className="flex min-h-full flex-col pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
          <a href={PORTAL_URL} title="Ir para o Portal do Ecossistema TB" className="flex min-h-12 items-center gap-2 font-extrabold text-marca hover:underline">
            <Store className="size-5" aria-hidden /> <span className="whitespace-nowrap">Eco Sistema TB</span>
          </a>
          <span className="hidden text-sm text-gray-500 sm:inline">· Check List</span>
          <div className="ml-auto flex items-center gap-2">
            {lojas.filter((l) => l.perfil).length > 1 ? (
              <label className="flex items-center gap-1 text-sm">
                <Building2 className="size-4 text-gray-500" aria-hidden />
                <span className="sr-only">Unidade</span>
                <select value={lojaAtual?.loja_id ?? ""} onChange={(e) => setLojaAtual(e.target.value)} className="min-h-10 max-w-[11rem] rounded-lg border border-gray-300 px-2 text-sm">
                  {lojas.filter((l) => l.perfil).map((l) => <option key={l.loja_id} value={l.loja_id}>{l.nome}</option>)}
                </select>
              </label>
            ) : lojaAtual && <span className="hidden text-sm text-gray-700 sm:inline">{lojaAtual.nome}</span>}
            <button onClick={() => setAberto((v) => !v)} className="flex min-h-12 min-w-12 items-center justify-center rounded-lg hover:bg-gray-100 lg:hidden" aria-label="Menu" aria-expanded={aberto}>
              {aberto ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </div>
        {barraStatus}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1">
        <nav aria-label="Menu" className={cx("fixed inset-x-0 top-[64px] z-20 border-b bg-white p-3 shadow-lg lg:static lg:block lg:w-60 lg:shrink-0 lg:border-0 lg:shadow-none", aberto ? "block" : "hidden")}>
          <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="font-semibold">{sessao?.nome}</div>
            <div className="text-gray-600">{perfil ? PERFIS[perfil] : "Sem perfil nesta unidade"}{lojaAtual ? ` · ${lojaAtual.nome}` : ""}</div>
            {MODO_DEMO && <div className="mt-1 text-xs font-semibold text-amber-800">Modo demonstração</div>}
          </div>
          <ul className="space-y-1" onClick={() => setAberto(false)}>
            {telas.map((t) => {
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
          {!lojas.some((l) => l.perfil) && (
            <div className="mb-3">
              <Aviso tom="alerta" titulo="Você ainda não está em nenhuma equipe">
                Peça ao gestor para incluir você na equipe de uma unidade (tela Equipe e perfis).
              </Aviso>
            </div>
          )}
          <Guarda><Outlet /></Guarda>
        </main>
      </div>

      {/* barra inferior no celular */}
      <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-white lg:hidden" style={{ gridTemplateColumns: `repeat(${Math.max(principais.length, 1)}, minmax(0, 1fr))` }}>
        {principais.map((t) => {
          const I = ICONES[t.codigo] ?? ClipboardCheck;
          return (
            <NavLink key={t.codigo} to={t.rota} end={t.rota === "/"} className={({ isActive }) => cx("flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs", isActive ? "font-bold text-marca" : "text-gray-700")}>
              <I className="size-6" aria-hidden /> {t.nome.split(" ")[0]}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
