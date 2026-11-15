// Topo igual ao dos outros sistemas: botão "Eco Sistema TB" leva ao Portal. Unidade e mês ficam sempre à vista.
import { LogOut, Store, Trophy } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useApp } from "../app/contexto";
import { MODO_DEMO } from "../data/conexao";
import { mesAtual, mesLongo, somarMeses } from "../lib/formato";
import { NOME_GRUPO, PORTAL_URL, TELAS_APP, telaDaRota, type Grupo } from "../lib/telas";
import { Aviso, Botao, classeEntrada, cx, Vazio } from "./base";

/** Os últimos 24 meses e os próximos 2 (para cadastrar a meta antes do mês começar). */
const opcoesMes = () => Array.from({ length: 27 }, (_, i) => somarMeses(mesAtual(), 2 - i));

export function Layout() {
  const { sessao, acesso, erroAcesso, unidade, escolherUnidade, mes, escolherMes, veTela, sair } = useApp();
  const { pathname } = useLocation();
  const telas = TELAS_APP.filter((t) => veTela(t.codigo));
  const grupos = [...new Set(telas.map((t) => t.grupo))] as Grupo[];
  const atual = telaDaRota(pathname);
  const bloqueada = atual && !veTela(atual.codigo);
  const unidades = acesso?.unidades ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-marca text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <a href={PORTAL_URL} title="Ir para o Portal do Ecossistema TB" className="flex min-h-12 items-center gap-2 rounded-lg px-2 font-extrabold tracking-wide hover:bg-white/10">
            <Store className="size-5" aria-hidden /> <span className="whitespace-nowrap">Eco Sistema TB</span>
          </a>
          <div className="flex items-center gap-2 font-semibold">
            <Trophy className="size-5" aria-hidden /> Meta de Vendas
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden sm:inline">{sessao?.nome}</span>
            <Botao variante="fantasma" className="text-white hover:bg-white/10" onClick={() => void sair()}>
              <LogOut className="size-4" aria-hidden /> Sair
            </Botao>
          </div>
        </div>
      </header>

      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-3 px-4 py-3">
          <label className="min-w-48 flex-1 text-sm sm:flex-none">
            <span className="mb-1 block font-semibold text-gray-800">Unidade</span>
            {unidades.length > 1 ? (
              <select className={classeEntrada} value={unidade?.id ?? ""} onChange={(e) => escolherUnidade(e.target.value)}>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.rede ? `${u.nome} · ${u.rede}` : u.nome}</option>)}
              </select>
            ) : (
              <div className="flex min-h-12 items-center font-semibold">{unidade ? unidade.nome : "—"}</div>
            )}
          </label>
          <label className="min-w-48 flex-1 text-sm sm:flex-none">
            <span className="mb-1 block font-semibold text-gray-800">Mês</span>
            <select className={classeEntrada} value={mes} onChange={(e) => escolherMes(e.target.value)}>
              {opcoesMes().map((m) => <option key={m} value={m}>{mesLongo(m)}{m === mesAtual() ? " (atual)" : ""}</option>)}
            </select>
          </label>
        </div>
        <nav aria-label="Telas do Meta de Vendas" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2">
            {grupos.flatMap((g, i) => [
              i > 0 ? <li key={`sep-${g}`} aria-hidden className="mx-1 w-px self-stretch bg-gray-200" /> : null,
              ...telas.filter((t) => t.grupo === g).map((t) => (
                <li key={t.codigo}>
                  <NavLink to={t.rota} title={NOME_GRUPO[g]}
                    className={({ isActive }) => cx("flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold",
                      isActive ? "bg-marca text-white" : "text-gray-700 hover:bg-marca-claro")}>
                    {t.nome}
                  </NavLink>
                </li>
              )),
            ])}
          </ul>
        </nav>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4">
        {MODO_DEMO && <Aviso tom="alerta">Modo demonstração: dados de exemplo, só neste navegador.</Aviso>}
        {erroAcesso && <Aviso tom="alerta" titulo="Não foi possível conferir as suas permissões">{erroAcesso} O menu mostra todas as telas; o banco continua barrando o que não for liberado.</Aviso>}
        {!unidade ? (
          <Vazio>
            Nenhuma unidade liberada para você no Meta de Vendas. Peça ao administrador para marcar a unidade como "usa o Meta de Vendas" e
            liberar as suas telas.
          </Vazio>
        ) : bloqueada ? (
          <Aviso tom="erro" titulo="Acesso negado">Você não tem permissão para esta tela. Peça ao administrador do Ecossistema TB para liberar.</Aviso>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
