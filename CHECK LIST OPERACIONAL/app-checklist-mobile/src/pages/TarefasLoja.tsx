// Visão do líder: todas as tarefas da unidade no dia, quem fez, tempo, nota;
// validar ou devolver a execução do fiscal (I3); cancelar tarefa com motivo.
import { useState } from "react";
import { Link } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { equipeDaLoja } from "../data/equipe";
import { Ban, Eye, ShieldCheck, Undo2 } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { PERFIS } from "../data/servidor";
import { textoPontuacao } from "../domain/regras";
import { situacaoTarefa } from "../domain/situacao";
import { dataBR, dataSP, duracao, horaSP, segundosEntre, somarDias } from "../domain/tempo";
import { Aviso, Botao, Campo, Cartao, Carregando, Titulo, Vazio, classeEntrada, cx } from "../ui/base";
import { SeloExecucao, SeloTarefa } from "../ui/estados";

export default function TarefasLoja() {
  const { lojaAtual, sessao } = useApp();
  const { db, repo } = useDados();
  const [data, setData] = useState(dataSP());
  const [acao, setAcao] = useState<{ tipo: "devolver" | "cancelar"; id: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const loja = lojaAtual?.loja_id;
  const usuario = sessao!.usuario_id;

  const d = useLiveQuery(async () => {
    if (!loja) return null;
    return {
      tarefas: (await db.tarefas.where("loja_id").equals(loja).toArray()).filter((t) => t.data_ref === data),
      execs: await db.execucoes.where("loja_id").equals(loja).toArray(),
      modelos: new Map((await db.modelos.toArray()).map((m) => [m.id, m])),
      membros: await equipeDaLoja(db, loja),
    };
  }, [loja, data]);

  if (!lojaAtual) return <Vazio>Você ainda não está na equipe de nenhuma unidade.</Vazio>;
  if (!d) return <Carregando />;
  const nome = (u: string | null | undefined) => d.membros.find((m) => m.usuario_id === u)?.nome ?? "—";
  const aguardando = d.execs.filter((e) => e.status === "concluida" && e.usuario_id !== usuario && !e.conclusao_pendente);

  async function executar(fn: () => Promise<void>) {
    setErro(null);
    try { await fn(); setAcao(null); setMotivo(""); } catch (e) { setErro((e as Error).message); }
  }

  const formMotivo = (id: string, tipo: "devolver" | "cancelar") => acao?.id === id && acao.tipo === tipo && (
    <div className="mt-3 space-y-2">
      <Campo rotulo={tipo === "devolver" ? "Motivo da devolução (obrigatório)" : "Motivo do cancelamento (obrigatório)"}>
        <textarea className={cx(classeEntrada, "min-h-20 py-2")} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <div className="flex gap-2">
        <Botao variante="perigo" onClick={() => executar(() => tipo === "devolver" ? repo.validarExecucao(id, false, motivo) : repo.cancelarTarefa(id, motivo))}>
          {tipo === "devolver" ? "Devolver para correção" : "Cancelar tarefa"}
        </Botao>
        <Botao variante="fantasma" onClick={() => setAcao(null)}>Voltar</Botao>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Titulo>Tarefas da loja · {lojaAtual.nome}</Titulo>
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {aguardando.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Aguardando a sua validação ({aguardando.length})</h2>
          {aguardando.map((e) => (
            <Cartao key={e.id}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{d.modelos.get(e.modelo_id)?.nome}</div>
                  <div className="text-sm text-gray-700">{nome(e.usuario_id)} · {dataBR(dataSP(e.inicio_em))} {horaSP(e.inicio_em)}–{e.fim_em ? horaSP(e.fim_em) : "?"} · {duracao(e.fim_em ? segundosEntre(e.inicio_em, e.fim_em) : null)} · Nota {textoPontuacao({ percentual: e.pontuacao ?? null })}</div>
                </div>
                <Link to={`/execucao/${e.id}`} className="inline-flex min-h-12 items-center gap-1 px-2 font-semibold text-marca"><Eye className="size-5" aria-hidden /> Ver</Link>
                <Botao onClick={() => executar(() => repo.validarExecucao(e.id, true))}><ShieldCheck className="size-5" aria-hidden /> Validar</Botao>
                <Botao variante="secundario" onClick={() => { setAcao({ tipo: "devolver", id: e.id }); setMotivo(""); }}><Undo2 className="size-5" aria-hidden /> Devolver</Botao>
              </div>
              {formMotivo(e.id, "devolver")}
            </Cartao>
          ))}
        </section>
      )}

      <Campo rotulo="Dia">
        <input type="date" className={classeEntrada} value={data} min={somarDias(dataSP(), -7)} max={somarDias(dataSP(), 1)} onChange={(e) => setData(e.target.value || dataSP())} />
      </Campo>
      {d.tarefas.length === 0 ? <Vazio>Nenhuma tarefa nesta data (o aparelho guarda os últimos 7 dias).</Vazio> : (
        <ul className="space-y-2">
          {d.tarefas.sort((a, b) => a.prazo.localeCompare(b.prazo)).map((t) => {
            const e = d.execs.filter((x) => x.tarefa_id === t.id).sort((a, b) => b.inicio_em.localeCompare(a.inicio_em))[0];
            const s = situacaoTarefa(t, e);
            return (
              <li key={t.id}>
                <Cartao className={s === "atrasada" ? "border-red-300" : undefined}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{d.modelos.get(t.modelo_id)?.nome}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                        <SeloTarefa s={s} />
                        {e && <SeloExecucao s={e.status} />}
                        <span>Prazo {horaSP(t.prazo)}</span>
                        <span>· {t.responsavel_id ? nome(t.responsavel_id) : `Qualquer ${PERFIS[t.perfil_responsavel ?? "operador"].toLowerCase()}`}</span>
                        {e && <span>· Feito por {nome(e.usuario_id)} · {duracao(e.fim_em ? segundosEntre(e.inicio_em, e.fim_em) : null)} · Nota {textoPontuacao({ percentual: e.pontuacao ?? null })}</span>}
                      </div>
                      {t.motivo_cancelamento && <div className="text-sm">Motivo: {t.motivo_cancelamento}</div>}
                    </div>
                    {e && <Link to={`/execucao/${e.id}`} className="inline-flex min-h-12 items-center gap-1 px-2 font-semibold text-marca"><Eye className="size-5" aria-hidden /> Ver</Link>}
                    {!t.concluida_em && !t.cancelada_em && (
                      <Botao variante="fantasma" onClick={() => { setAcao({ tipo: "cancelar", id: t.id }); setMotivo(""); }}><Ban className="size-5" aria-hidden /> Cancelar</Botao>
                    )}
                  </div>
                  {formMotivo(t.id, "cancelar")}
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
