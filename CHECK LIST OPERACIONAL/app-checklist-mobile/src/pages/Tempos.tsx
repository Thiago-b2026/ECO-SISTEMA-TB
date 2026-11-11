// Tempos de execução (checklist.tempos, supervisor ou acima): filtros, tabela das execuções, comparativos
// (pessoas, lojas, média do período, última execução), evolução, ranking dos itens que mais demoram e a
// linha do tempo de cada execução. Base: tempo ATIVO (total − pausas). Referência: o tempo padrão;
// sem padrão, a média do período. Os cálculos são os de src/domain/tempos.ts (iguais no Supabase e no demo).
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Clock, Gauge, RefreshCw, Save, Settings2, Timer, X, Zap } from "lucide-react";
import { useApp } from "../app/contexto";
import { servidor } from "../data/conexao";
import type { DadosTempos } from "../data/servidor";
import { dataBR, dataHoraSP, dataSP, duracao, horaSP, somarDias } from "../domain/tempo";
import {
  CONFIG_PADRAO, ROTULO_SITUACAO, analisarExecucoes, analisarItens, compararPor, evolucao, rankingItens, resumoTempos,
  type ConfigTempos, type ExecAnalisada, type SituacaoTempo,
} from "../domain/tempos";
import { Aviso, Botao, Campo, Cartao, Carregando, Selo, Titulo, Vazio, classeEntrada, cx, type Tom } from "../ui/base";

const COR = "#0f5132";
const COR_PADRAO = "#b45309";

export const TOM_SITUACAO: Record<SituacaoTempo, Tom> = {
  no_tempo: "ok", acima: "alerta", muito_acima: "erro", rapido_demais: "erro", sem_referencia: "neutro",
};

export function SeloSituacao({ s }: { s: SituacaoTempo }) {
  return <Selo tom={TOM_SITUACAO[s]} icone={s === "rapido_demais" ? Zap : s === "no_tempo" ? CheckCircle2 : s === "sem_referencia" ? undefined : AlertTriangle}>{ROTULO_SITUACAO[s]}</Selo>;
}

const pct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}%`);
const minutos = (seg: number | null | undefined) => (seg == null ? null : Math.round((seg / 60) * 10) / 10);

function Bloco({ rotulo, valor, icone: I, detalhe, tom }: { rotulo: string; valor: string; icone: typeof Clock; detalhe?: string; tom?: "erro" }) {
  return (
    <Cartao className={cx("flex min-w-0 items-start gap-3", tom === "erro" && "border-red-300")}>
      <I className={cx("mt-1 size-6 shrink-0", tom === "erro" ? "text-red-700" : "text-marca")} aria-hidden />
      <div className="min-w-0">
        <div className="text-sm text-gray-600">{rotulo}</div>
        <div className="break-words text-2xl font-bold text-gray-900">{valor}</div>
        {detalhe && <div className="text-xs text-gray-600">{detalhe}</div>}
      </div>
    </Cartao>
  );
}

/** Tabela que rola sozinha no celular (a página não rola para o lado). */
function Tabela({ titulo, cabecalho, children }: { titulo: string; cabecalho: string[]; children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">{titulo}</caption>
        <thead><tr className="border-b text-left text-gray-600">{cabecalho.map((c, n) => <th key={c} className={cx("py-1 pr-2 font-medium", n > 0 && "text-right")}>{c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Comparativo({ titulo, linhas }: { titulo: string; linhas: ReturnType<typeof compararPor> }) {
  const dados = linhas.map((l) => ({ nome: l.nome, min: minutos(l.media_seg) }));
  return (
    <Cartao>
      <h2 className="mb-2 font-semibold">{titulo}</h2>
      {linhas.length > 1 && (
        <div style={{ height: Math.max(110, linhas.length * 38 + 40) }} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={8}>
              <CartesianGrid horizontal={false} stroke="#e5e7eb" />
              <XAxis type="number" tickFormatter={(v) => `${v} min`} stroke="#6b7280" fontSize={12} />
              <YAxis type="category" dataKey="nome" width={130} stroke="#6b7280" fontSize={12} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(15,81,50,0.06)" }} formatter={(v) => [`${Number(v).toLocaleString("pt-BR")} min`, "Tempo médio"]} />
              <Bar dataKey="min" fill={COR} radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <Tabela titulo={titulo} cabecalho={["Nome", "Execuções", "Tempo médio", "× média geral", "Rápido demais"]}>
        {linhas.map((l) => (
          <tr key={l.chave} className="border-b last:border-0">
            <td className="py-1.5 pr-2">{l.nome}</td>
            <td className="py-1.5 pr-2 text-right">{l.n}</td>
            <td className="py-1.5 pr-2 text-right font-semibold">{duracao(l.media_seg)}</td>
            <td className="py-1.5 pr-2 text-right">{pct(l.vs_media_pct)}</td>
            <td className={cx("py-1.5 text-right", l.rapido_demais > 0 && "font-semibold text-red-800")}>{l.rapido_demais}</td>
          </tr>
        ))}
      </Tabela>
    </Cartao>
  );
}

/** Linha do tempo de uma execução: cada item como uma barra, da hora de início à hora de fim. */
function LinhaDoTempo({ e, itens, onFechar }: { e: ExecAnalisada; itens: ReturnType<typeof analisarItens>; onFechar: () => void }) {
  const ini = new Date(e.inicio_em).getTime();
  const total = Math.max(1, new Date(e.fim_em).getTime() - ini);
  const meus = itens.filter((i) => i.execucao_id === e.execucao_id && i.iniciado_em)
    .sort((a, b) => a.iniciado_em!.localeCompare(b.iniciado_em!));
  return (
    <Cartao className="space-y-3" aria-labelledby="titulo-linha">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 id="titulo-linha" className="font-semibold">Linha do tempo · {e.modelo}</h2>
          <p className="text-sm text-gray-700">
            {e.pessoa} · {e.loja} · {dataHoraSP(e.inicio_em)} → {horaSP(e.fim_em)} · ativo <b>{duracao(e.real_seg)}</b>
            {e.pausado_seg > 0 && <> (parado {duracao(e.pausado_seg)})</>} · <SeloSituacao s={e.situacao} />
          </p>
        </div>
        <Botao variante="fantasma" aria-label="Fechar linha do tempo" onClick={onFechar}><X className="size-5" /></Botao>
      </div>
      {meus.length === 0 ? <Vazio>Esta execução não tem tempo por item (feita antes da medição por item).</Vazio> : (
        <ol className="space-y-2">
          {meus.map((i) => {
            const a = new Date(i.iniciado_em!).getTime();
            const b = i.concluido_em ? new Date(i.concluido_em).getTime() : a;
            const esq = Math.min(100, Math.max(0, ((a - ini) / total) * 100));
            const larg = Math.max(1, Math.min(100 - esq, ((b - a) / total) * 100));
            return (
              <li key={i.item_id} className="text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="min-w-0 flex-1 truncate">{i.texto}</span>
                  <span className="whitespace-nowrap text-gray-700">
                    {horaSP(i.iniciado_em!)}–{i.concluido_em ? horaSP(i.concluido_em) : "?"} · <b>{duracao(i.duracao_seg)}</b>
                    {i.padrao_seg ? ` / padrão ${duracao(i.padrao_seg)}` : ""}
                  </span>
                </div>
                <div className="relative mt-1 h-3 rounded bg-gray-100" aria-hidden>
                  <div className={cx("absolute inset-y-0 rounded", i.situacao === "no_tempo" || i.situacao === "sem_referencia" ? "bg-marca" : i.situacao === "acima" ? "bg-amber-500" : "bg-red-600")}
                    style={{ left: `${esq}%`, width: `${larg}%` }} />
                </div>
                {i.situacao !== "no_tempo" && i.situacao !== "sem_referencia" && <div className="mt-0.5"><SeloSituacao s={i.situacao} /></div>}
              </li>
            );
          })}
        </ol>
      )}
    </Cartao>
  );
}

function Limites({ rede, atual, onSalvo }: { rede: string; atual: ConfigTempos; onSalvo: () => void }) {
  const [c, setC] = useState(atual);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setC(atual), [atual]);
  const campo = (k: keyof ConfigTempos, rotulo: string) => (
    <Campo rotulo={rotulo}>
      <input type="number" inputMode="numeric" min={1} className={classeEntrada} value={c[k]} onChange={(e) => { setOk(false); setC({ ...c, [k]: Number(e.target.value) }); }} />
    </Campo>
  );
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-semibold"><Settings2 className="size-5" aria-hidden /> Limites desta empresa (gestor)</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {campo("acima_pct", "Acima do padrão: mais de + (%)")}
        {campo("muito_acima_pct", "Muito acima: mais de + (%)")}
        {campo("rapido_pct", "Rápido demais: menos de (%)")}
      </div>
      {erro && <div className="mt-2"><Aviso tom="erro">{erro}</Aviso></div>}
      {ok && <div className="mt-2"><Aviso tom="ok">Limites salvos.</Aviso></div>}
      <Botao className="mt-3" variante="secundario" carregando={salvando} onClick={async () => {
        setErro(null); setSalvando(true);
        try {
          if (!(c.muito_acima_pct > c.acima_pct)) throw new Error("\"Muito acima\" precisa ser maior que \"acima do padrão\".");
          await servidor.salvarConfigTempos(rede, c); setOk(true); onSalvo();
        } catch (x) { setErro((x as Error).message); } finally { setSalvando(false); }
      }}><Save className="size-5" aria-hidden /> Salvar limites</Botao>
    </details>
  );
}

export default function Tempos() {
  const { lojas, empresaAtual, maiorPerfil } = useApp();
  const supervisorEm = lojas.filter((l) => l.perfil === "supervisor" || l.perfil === "gestor");
  const [de, setDe] = useState(somarDias(dataSP(), -29));
  const [ate, setAte] = useState(dataSP());
  const [loja, setLoja] = useState("");
  const [modelo, setModelo] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [situacao, setSituacao] = useState<"" | SituacaoTempo>("");
  const [d, setD] = useState<DadosTempos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const rede = empresaAtual?.rede_id ?? null;

  async function carregar() {
    setErro(null); setCarregando(true);
    try { setD(await servidor.dadosTempos(de, ate, rede, loja || null)); } catch (e) { setErro((e as Error).message); } finally { setCarregando(false); }
  }
  useEffect(() => { void carregar(); }, [de, ate, loja, rede]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfgDaRede = useMemo(() => {
    const m = new Map((d?.config ?? []).map((c) => [c.rede_id, c]));
    return (r: string | null | undefined) => (r && m.get(r)) || CONFIG_PADRAO;
  }, [d]);
  // análise sobre TODO o período (a média do checklist não muda com o filtro de pessoa/situação)
  const todas = useMemo(() => (d ? analisarExecucoes(d.execucoes, cfgDaRede) : []), [d, cfgDaRede]);
  const itensAn = useMemo(() => (d ? analisarItens(d.itens, d.execucoes, cfgDaRede) : []), [d, cfgDaRede]);
  const modelos = useMemo(() => {
    const m = new Map<string, { nome: string; n: number }>();
    for (const e of todas) m.set(e.modelo_id, { nome: e.modelo, n: (m.get(e.modelo_id)?.n ?? 0) + 1 });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [todas]);
  const pessoas = useMemo(() => [...new Map(todas.map((e) => [e.usuario_id, e.pessoa])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [todas]);
  // comparar "a mesma tarefa": sem checklist escolhido, usa o que mais tem execuções
  const modeloComparado = modelo || modelos[0]?.[0] || "";

  const filtradas = todas.filter((e) => (!modelo || e.modelo_id === modelo) && (!pessoa || e.usuario_id === pessoa) && (!situacao || e.situacao === situacao));
  const mesmoChecklist = todas.filter((e) => e.modelo_id === modeloComparado && (!pessoa || e.usuario_id === pessoa));
  const resumo = resumoTempos(filtradas);
  const evo = evolucao(mesmoChecklist).map((x) => ({ ...x, rotulo: dataBR(x.data).slice(0, 5), media_min: minutos(x.media_seg), padrao_min: minutos(x.padrao_seg) }));
  const idsMesmo = new Set(mesmoChecklist.map((e) => e.execucao_id));
  const ranking = rankingItens((d?.itens ?? []).filter((i) => idsMesmo.has(i.execucao_id)));
  const execAberta = aberta ? todas.find((e) => e.execucao_id === aberta) : undefined;
  const nomeComparado = modelos.find(([id]) => id === modeloComparado)?.[1].nome;
  const cfgAtual = cfgDaRede(rede);

  return (
    <div className="space-y-4">
      <Titulo acao={<Botao variante="fantasma" onClick={carregar} carregando={carregando}><RefreshCw className="size-5" aria-hidden /> Atualizar</Botao>}>Tempos de execução</Titulo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="De"><input type="date" className={classeEntrada} value={de} max={ate} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo rotulo="Até"><input type="date" className={classeEntrada} value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></Campo>
        <Campo rotulo="Unidade">
          <select className={classeEntrada} value={loja} onChange={(e) => setLoja(e.target.value)}>
            <option value="">Todas as minhas ({supervisorEm.length})</option>
            {supervisorEm.map((l) => <option key={l.loja_id} value={l.loja_id}>{l.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Checklist">
          <select className={classeEntrada} value={modelo} onChange={(e) => setModelo(e.target.value)}>
            <option value="">Todos ({modelos.length})</option>
            {modelos.map(([id, m]) => <option key={id} value={id}>{m.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Pessoa">
          <select className={classeEntrada} value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
            <option value="">Todas ({pessoas.length})</option>
            {pessoas.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Situação">
          <select className={classeEntrada} value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoTempo | "")}>
            <option value="">Todas</option>
            {(Object.keys(ROTULO_SITUACAO) as SituacaoTempo[]).map((s) => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
          </select>
        </Campo>
      </div>
      <p className="text-xs text-gray-600">
        Tempo ativo = do início ao fim, sem as pausas (app em 2º plano ou fora da tela). Referência: o tempo padrão do checklist; sem padrão, a média do período.
        Acima do padrão: mais de +{cfgAtual.acima_pct}% · Muito acima: mais de +{cfgAtual.muito_acima_pct}% · Rápido demais: menos de {cfgAtual.rapido_pct}% (possível check sem fazer).
      </p>
      {erro && <Aviso tom="erro" titulo="Não foi possível carregar os tempos">{erro} {servidor.modo === "supabase" && "Esta tela precisa de internet."}</Aviso>}
      {!d ? (carregando && <Carregando />) : todas.length === 0 ? <Vazio>Nenhuma execução concluída no período.</Vazio> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Bloco icone={Timer} rotulo="Tempo médio (ativo)" valor={duracao(resumo.media_seg)} detalhe={`${resumo.n} execução(ões)`} />
            <Bloco icone={Clock} rotulo="Padrão médio" valor={duracao(resumo.padrao_medio_seg)} detalhe={resumo.padrao_medio_seg ? undefined : "sem tempo padrão"} />
            <Bloco icone={Gauge} rotulo="No tempo" valor={resumo.pct_no_tempo == null ? "—" : `${resumo.pct_no_tempo}%`} detalhe={`${resumo.acima} acima · ${resumo.muito_acima} muito acima`} />
            <Bloco icone={Zap} rotulo="Rápido demais" valor={String(resumo.rapido_demais)} tom={resumo.rapido_demais ? "erro" : undefined} detalhe="conferir se foi feito" />
          </div>

          {execAberta && <LinhaDoTempo e={execAberta} itens={itensAn} onFechar={() => setAberta(null)} />}

          <Cartao>
            <h2 className="mb-2 font-semibold">Execuções ({filtradas.length})</h2>
            {filtradas.length === 0 ? <Vazio>Nenhuma execução com esses filtros.</Vazio> : (
              <Tabela titulo="Execuções" cabecalho={["Data · checklist · pessoa", "Tempo ativo", "Parado", "Referência", "Média", "Última", "Diferença", "Situação"]}>
                {[...filtradas].reverse().map((e) => (
                  <tr key={e.execucao_id} className={cx("border-b align-top last:border-0", aberta === e.execucao_id && "bg-marca-claro")}>
                    <td className="py-1.5 pr-2">
                      <button type="button" className="text-left font-medium text-marca underline" onClick={() => setAberta(e.execucao_id)}>
                        {dataHoraSP(e.inicio_em)}
                      </button>
                      <div className="text-xs text-gray-600">{e.modelo} · {e.pessoa} · {e.loja}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-semibold">{duracao(e.real_seg)}</td>
                    <td className="py-1.5 pr-2 text-right">{e.pausado_seg ? duracao(e.pausado_seg) : "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{duracao(e.referencia_seg)}<div className="text-xs text-gray-600">{e.base === "padrao" ? "padrão" : e.base === "media" ? "média" : ""}</div></td>
                    <td className="py-1.5 pr-2 text-right">{duracao(e.media_seg)}</td>
                    <td className="py-1.5 pr-2 text-right">{duracao(e.ultima_seg)}</td>
                    <td className="py-1.5 pr-2 text-right">{pct(e.diferenca_pct)}</td>
                    <td className="py-1.5 text-right"><SeloSituacao s={e.situacao} /></td>
                  </tr>
                ))}
              </Tabela>
            )}
            <p className="mt-2 text-xs text-gray-600">Toque na data para ver a linha do tempo da execução. "Última" = a execução anterior do mesmo checklist na mesma loja.</p>
          </Cartao>

          <h2 className="pt-2 text-lg font-bold">Comparativos · {nomeComparado}{!modelo && modelos.length > 1 && <span className="text-sm font-normal text-gray-600"> (o checklist com mais execuções; escolha outro no filtro)</span>}</h2>
          <Comparativo titulo="A mesma tarefa entre pessoas" linhas={compararPor(mesmoChecklist, "pessoa")} />
          {new Set(mesmoChecklist.map((e) => e.loja_id)).size > 1 && <Comparativo titulo="A mesma tarefa entre lojas" linhas={compararPor(mesmoChecklist, "loja")} />}

          <Cartao>
            <h2 className="mb-2 font-semibold">Evolução (média do dia × padrão)</h2>
            {evo.length > 1 && (
              <div style={{ height: 220 }} aria-hidden>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evo} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                    <CartesianGrid stroke="#e5e7eb" />
                    <XAxis dataKey="rotulo" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `${v}`} width={36} unit="m" />
                    <Tooltip formatter={(v, n) => [`${Number(v).toLocaleString("pt-BR")} min`, n === "media_min" ? "Média" : "Padrão"]} />
                    <Legend formatter={(v) => (v === "media_min" ? "Média do dia" : "Padrão")} />
                    <Line type="monotone" dataKey="media_min" stroke={COR} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="stepAfter" dataKey="padrao_min" stroke={COR_PADRAO} strokeDasharray="5 4" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <Tabela titulo="Evolução por dia" cabecalho={["Dia", "Execuções", "Média", "Padrão"]}>
              {evo.map((x) => (
                <tr key={x.data} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">{dataBR(x.data)}</td>
                  <td className="py-1.5 pr-2 text-right">{x.n}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold">{duracao(x.media_seg)}</td>
                  <td className="py-1.5 text-right">{duracao(x.padrao_seg)}</td>
                </tr>
              ))}
            </Tabela>
          </Cartao>

          <Cartao>
            <h2 className="mb-2 font-semibold">Itens que mais demoram</h2>
            {ranking.length === 0 ? <Vazio>Sem tempo por item no período.</Vazio> : (
              <Tabela titulo="Itens que mais demoram" cabecalho={["Item", "Vezes", "Média", "Maior", "Padrão"]}>
                {ranking.map((r, n) => (
                  <tr key={r.item_id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">{n + 1}. {r.texto}</td>
                    <td className="py-1.5 pr-2 text-right">{r.n}</td>
                    <td className={cx("py-1.5 pr-2 text-right font-semibold", !!r.padrao_seg && r.media_seg > r.padrao_seg && "text-red-800")}>{duracao(r.media_seg)}</td>
                    <td className="py-1.5 pr-2 text-right">{duracao(r.max_seg)}</td>
                    <td className="py-1.5 text-right">{duracao(r.padrao_seg)}</td>
                  </tr>
                ))}
              </Tabela>
            )}
          </Cartao>
        </>
      )}
      {maiorPerfil === "gestor" && rede && <Limites rede={rede} atual={cfgAtual} onSalvo={carregar} />}
    </div>
  );
}
