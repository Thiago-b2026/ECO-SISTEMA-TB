// Dashboard de produtividade: concluídas, atrasadas, tempo médio, conformidade por setor, por pessoa e por loja.
// Dados do servidor (checklist.dashboard), só das unidades em que a pessoa é supervisor ou gestor.
// Tempos (etapa 13): tempo médio ativo × padrão, % no tempo e "rápido demais" (checklist.dados_tempos). Se os tempos
// falharem (ex.: migration de tempos ainda não aplicada), o resto do dashboard continua.
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Clock, Gauge, ListTodo, RefreshCw, Timer, Wrench, Zap } from "lucide-react";
import { Link } from "react-router";
import { useApp } from "../app/contexto";
import { servidor } from "../data/conexao";
import { nomeSetor } from "../data/seed-modelos";
import type { Dashboard as Dados } from "../data/servidor";
import { textoPontuacao } from "../domain/regras";
import { dataSP, duracao, somarDias } from "../domain/tempo";
import { CONFIG_PADRAO, analisarExecucoes, resumoTempos } from "../domain/tempos";
import { Aviso, Botao, Campo, Cartao, Carregando, Titulo, Vazio, classeEntrada } from "../ui/base";

const COR = "#0f5132";

function Bloco({ rotulo, valor, icone: I, detalhe, alerta }: { rotulo: string; valor: string; icone: typeof Clock; detalhe?: string; alerta?: boolean }) {
  return (
    <Cartao className={`flex min-w-0 items-start gap-3${alerta ? " border-red-300" : ""}`}>
      <I className={`mt-1 size-6 shrink-0 ${alerta ? "text-red-700" : "text-marca"}`} aria-hidden />
      <div className="min-w-0">
        <div className="text-sm text-gray-600">{rotulo}</div>
        {/* textos longos ("Sem pontuação aplicável") não podem passar da largura do celular */}
        <div className={`${valor.length > 12 ? "text-lg leading-tight" : "text-2xl"} break-words font-bold text-gray-900`}>{valor}</div>
        {detalhe && <div className="text-xs text-gray-600">{detalhe}</div>}
      </div>
    </Cartao>
  );
}

/** Barras horizontais de conformidade (0–100%), uma série, com tabela logo abaixo. */
function GraficoConformidade({ titulo, linhas }: { titulo: string; linhas: { nome: string; conformidade: number | null; extra: string }[] }) {
  const comNota = linhas.filter((l) => l.conformidade != null);
  return (
    <Cartao>
      <h2 className="mb-2 font-semibold">{titulo}</h2>
      {comNota.length === 0 ? <Vazio>Sem pontuação aplicável no período.</Vazio> : (
        <div style={{ height: Math.max(120, comNota.length * 40 + 40) }} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comNota} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={8}>
              <CartesianGrid horizontal={false} stroke="#e5e7eb" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#6b7280" fontSize={12} />
              <YAxis type="category" dataKey="nome" width={130} stroke="#6b7280" fontSize={12} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(15,81,50,0.06)" }} formatter={(v) => [`${Number(v).toLocaleString("pt-BR")}%`, "Conformidade"]} />
              <Bar dataKey="conformidade" fill={COR} radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">{titulo}</caption>
        <thead><tr className="border-b text-left text-gray-600"><th className="py-1 font-medium">Nome</th><th className="py-1 text-right font-medium">Conformidade</th><th className="py-1 text-right font-medium">Detalhe</th></tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome} className="border-b last:border-0">
              <td className="py-1.5">{l.nome}</td>
              <td className="py-1.5 text-right font-semibold">{textoPontuacao({ percentual: l.conformidade })}</td>
              <td className="py-1.5 text-right text-gray-700">{l.extra}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Cartao>
  );
}

export default function Dashboard() {
  const { lojas, empresaAtual } = useApp();
  const supervisorEm = lojas.filter((l) => l.perfil === "supervisor" || l.perfil === "gestor");
  const [de, setDe] = useState(somarDias(dataSP(), -6));
  const [ate, setAte] = useState(dataSP());
  const [loja, setLoja] = useState<string>("");
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [tempos, setTempos] = useState<ReturnType<typeof resumoTempos> | null>(null);
  const [erroTempos, setErroTempos] = useState<string | null>(null);

  async function carregar() {
    setErro(null);
    setCarregando(true);
    const rede = empresaAtual?.rede_id ?? null;
    const [dash, tps] = await Promise.allSettled([servidor.dashboard(de, ate, loja || null, rede), servidor.dadosTempos(de, ate, rede, loja || null)]);
    if (dash.status === "fulfilled") setD(dash.value); else setErro((dash.reason as Error).message);
    if (tps.status === "fulfilled") {
      const cfg = new Map(tps.value.config.map((c) => [c.rede_id, c]));
      setTempos(resumoTempos(analisarExecucoes(tps.value.execucoes, (r) => (r && cfg.get(r)) || CONFIG_PADRAO)));
      setErroTempos(null);
    } else { setTempos(null); setErroTempos((tps.reason as Error).message); }
    setCarregando(false);
  }
  useEffect(() => { void carregar(); }, [de, ate, loja, empresaAtual?.rede_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <Titulo acao={<Botao variante="fantasma" onClick={carregar} carregando={carregando}><RefreshCw className="size-5" aria-hidden /> Atualizar</Botao>}>Dashboard</Titulo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="De"><input type="date" className={classeEntrada} value={de} max={ate} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo rotulo="Até"><input type="date" className={classeEntrada} value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></Campo>
        <Campo rotulo="Unidade">
          <select className={classeEntrada} value={loja} onChange={(e) => setLoja(e.target.value)}>
            <option value="">Todas as minhas ({supervisorEm.length})</option>
            {supervisorEm.map((l) => <option key={l.loja_id} value={l.loja_id}>{l.nome}</option>)}
          </select>
        </Campo>
      </div>
      {erro && <Aviso tom="erro" titulo="Não foi possível carregar o dashboard">{erro} {servidor.modo === "supabase" && "O dashboard precisa de internet."}</Aviso>}
      {!d ? (carregando && <Carregando />) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Bloco icone={CheckCircle2} rotulo="Tarefas concluídas" valor={`${d.tarefas_concluidas} de ${d.tarefas_total}`} detalhe={`${d.concluidas_no_prazo} no prazo`} />
            <Bloco icone={AlertTriangle} rotulo="Atrasadas" valor={String(d.tarefas_atrasadas)} detalhe={`${d.tarefas_pendentes} ainda no prazo`} />
            <Bloco icone={Clock} rotulo="Tempo médio" valor={duracao(d.tempo_medio_seg)} detalhe={`${d.execucoes} execução(ões)`} />
            <Bloco icone={Gauge} rotulo="Conformidade" valor={textoPontuacao({ percentual: d.conformidade })} />
            <Bloco icone={Wrench} rotulo="Planos abertos" valor={String(d.planos_abertos)} detalhe={`${d.planos_atrasados} atrasado(s)`} />
            <Bloco icone={ListTodo} rotulo="Taxa de conclusão" valor={d.tarefas_total ? `${Math.round((100 * d.tarefas_concluidas) / d.tarefas_total)}%` : "—"} />
          </div>
          <section aria-labelledby="dash-tempos" className="space-y-2">
            <h2 id="dash-tempos" className="flex flex-wrap items-baseline gap-x-3 text-lg font-bold">
              Tempo de execução
              <Link to="/tempos" className="text-sm font-semibold text-marca underline">Ver detalhes</Link>
            </h2>
            {erroTempos ? <Aviso tom="alerta">Os tempos não puderam ser carregados ({erroTempos}). O restante do dashboard está certo.</Aviso>
              : !tempos ? <Carregando /> : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Bloco icone={Timer} rotulo="Tempo médio × padrão" valor={`${duracao(tempos.media_seg)} / ${duracao(tempos.padrao_medio_seg)}`}
                    detalhe={tempos.padrao_medio_seg ? `tempo ativo · ${tempos.n} execução(ões)` : "sem tempo padrão definido"} />
                  <Bloco icone={Gauge} rotulo="% no tempo" valor={tempos.pct_no_tempo == null ? "—" : `${tempos.pct_no_tempo}%`}
                    detalhe={`${tempos.acima} acima · ${tempos.muito_acima} muito acima`} />
                  <Bloco icone={Zap} rotulo="Rápido demais" valor={String(tempos.rapido_demais)} alerta={tempos.rapido_demais > 0}
                    detalhe="possível check sem fazer: conferir" />
                </div>
              )}
          </section>
          <GraficoConformidade titulo="Conformidade por setor" linhas={d.por_setor.map((s) => ({ nome: nomeSetor(s.setor), conformidade: s.conformidade == null ? null : Number(s.conformidade), extra: `${s.nao_conformes} não conforme(s) em ${s.itens}` }))} />
          <GraficoConformidade titulo="Conformidade e produtividade por pessoa" linhas={d.por_pessoa.map((p) => ({ nome: p.nome, conformidade: p.conformidade == null ? null : Number(p.conformidade), extra: `${p.execucoes} exec. · ${duracao(p.tempo_medio_seg)} em média${p.concluidas_com_atraso ? ` · ${p.concluidas_com_atraso} com atraso` : ""}` }))} />
          {d.por_loja.length > 1 && (
            <GraficoConformidade titulo="Por unidade" linhas={d.por_loja.map((l) => ({ nome: l.nome, conformidade: l.conformidade == null ? null : Number(l.conformidade), extra: `${l.concluidas} concluída(s) · ${l.atrasadas} atrasada(s)` }))} />
          )}
        </>
      )}
    </div>
  );
}
