// Minhas tarefas de hoje (por unidade), com situação calculada e botão para iniciar/continuar.
import { useState } from "react";
import { useNavigate } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, ClipboardPlus, Play, RefreshCw, RotateCcw } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { nivel } from "../data/servidor";
import { situacaoTarefa, type SituacaoTarefa } from "../domain/situacao";
import { dataBR, dataSP, horaSP } from "../domain/tempo";
import type { Tarefa } from "../domain/tipos";
import { Aviso, Botao, Cartao, Carregando, Titulo, Vazio, classeEntrada } from "../ui/base";
import { SeloExecucao, SeloTarefa } from "../ui/estados";

const ORDEM: Record<SituacaoTarefa, number> = { atrasada: 0, em_andamento: 1, pendente: 2, concluida: 3, cancelada: 4 };

export default function Hoje() {
  const { lojaAtual, perfil, sessao, empresaAtual } = useApp();
  const { db, repo, pronto, atualizar } = useDados();
  const navigate = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [avulso, setAvulso] = useState("");
  const hoje = dataSP();
  const loja = lojaAtual?.loja_id;
  const usuario = sessao!.usuario_id;

  const dados = useLiveQuery(async () => {
    if (!loja) return null;
    const tarefas = (await db.tarefas.where("loja_id").equals(loja).toArray()).filter((t) => t.data_ref === hoje);
    const execs = await db.execucoes.where("loja_id").equals(loja).toArray();
    // só os checklists da empresa escolhida
    const modelos = new Map((await db.modelos.where("rede_id").equals(empresaAtual?.rede_id ?? "-").toArray()).map((m) => [m.id, m]));
    // "minhas": atribuídas a mim, ou ao meu perfil sem responsável
    const minhas = tarefas.filter((t) => t.responsavel_id === usuario || (!t.responsavel_id && t.perfil_responsavel === perfil));
    const devolvidas = execs.filter((e) => e.usuario_id === usuario && e.status === "devolvida");
    const avulsas = execs.filter((e) => e.usuario_id === usuario && !e.tarefa_id && e.status === "em_andamento");
    // a chave diz de qual unidade/empresa é o resultado (evita mostrar a unidade anterior ao trocar)
    return { chave: `${loja}|${empresaAtual?.rede_id}`, minhas, execs, modelos, devolvidas, avulsas };
  }, [loja, hoje, usuario, perfil, empresaAtual?.rede_id]);

  if (!lojaAtual) return <Vazio>Você ainda não está na equipe de nenhuma unidade.</Vazio>;
  if (!pronto || !dados || dados.chave !== `${loja}|${empresaAtual?.rede_id}`) return <Carregando />;

  const execDaTarefa = (t: Tarefa) => dados.execs.filter((e) => e.tarefa_id === t.id).sort((a, b) => b.inicio_em.localeCompare(a.inicio_em))[0];
  const lista = dados.minhas
    .map((t) => ({ t, e: execDaTarefa(t), s: situacaoTarefa(t, execDaTarefa(t)) }))
    .sort((a, b) => ORDEM[a.s] - ORDEM[b.s] || a.t.prazo.localeCompare(b.t.prazo));
  const modelosAvulsos = [...dados.modelos.values()].filter((m) => nivel(perfil) >= nivel(m.perfil_executor)).sort((a, b) => a.nome.localeCompare(b.nome));

  async function abrir(t: Tarefa | null, modeloId: string) {
    setErro(null);
    setAbrindo(t?.id ?? modeloId);
    try {
      const id = await repo.iniciar({ tarefa: t ?? undefined, modeloId, lojaId: lojaAtual!.loja_id });
      navigate(`/execucao/${id}`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAbrindo(null);
    }
  }

  async function corrigir(execId: string) {
    setErro(null);
    setAbrindo(execId);
    try {
      await repo.trazerDoServidor(execId);
      navigate(`/execucao/${execId}`);
    } catch (e) {
      setErro(`Não foi possível abrir a execução devolvida: ${(e as Error).message}`);
    } finally {
      setAbrindo(null);
    }
  }

  return (
    <div className="space-y-4">
      <Titulo acao={<Botao variante="fantasma" onClick={() => void atualizar()} aria-label="Atualizar"><RefreshCw className="size-5" aria-hidden /> Atualizar</Botao>}>
        Minhas tarefas · {dataBR(hoje)}
      </Titulo>
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {dados.devolvidas.map((e) => (
        <Cartao key={e.id} className="border-amber-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">{dados.modelos.get(e.modelo_id)?.nome ?? "Checklist"}</div>
              <SeloExecucao s="devolvida" />
              {e.motivo_devolucao && <p className="mt-1 text-sm text-gray-700">Motivo: {e.motivo_devolucao}</p>}
            </div>
            <Botao onClick={() => corrigir(e.id)} carregando={abrindo === e.id}><RotateCcw className="size-5" aria-hidden /> Corrigir</Botao>
          </div>
        </Cartao>
      ))}

      {lista.length === 0 ? (
        <Vazio>Nenhuma tarefa para você hoje nesta unidade.</Vazio>
      ) : (
        <ul className="space-y-3">
          {lista.map(({ t, e, s }) => {
            const m = dados.modelos.get(t.modelo_id);
            const podeAbrir = s !== "cancelada" && !(s === "concluida" && !e);
            return (
              <li key={t.id}>
                <Cartao className={s === "atrasada" ? "border-red-300" : undefined}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold leading-tight">{m?.nome ?? "Checklist"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                        <SeloTarefa s={s} />
                        <span>Prazo: {horaSP(t.prazo)}</span>
                        {e && <span>Início: {horaSP(e.inicio_em)}</span>}
                      </div>
                    </div>
                    {s === "concluida" || s === "cancelada" ? (
                      e && <Botao variante="fantasma" onClick={() => navigate(`/execucao/${e.id}`)} aria-label="Ver execução"><ChevronRight className="size-6" aria-hidden /></Botao>
                    ) : (
                      podeAbrir && <Botao onClick={() => abrir(t, t.modelo_id)} carregando={abrindo === t.id}><Play className="size-5" aria-hidden /> {e ? "Continuar" : "Iniciar"}</Botao>
                    )}
                  </div>
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}

      {dados.avulsas.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Checklists avulsos em andamento</h2>
          <ul className="space-y-2">
            {dados.avulsas.map((e) => (
              <li key={e.id}>
                <Cartao className="flex items-center justify-between gap-2">
                  <span>{dados.modelos.get(e.modelo_id)?.nome} · início {horaSP(e.inicio_em)}</span>
                  <Botao variante="secundario" onClick={() => navigate(`/execucao/${e.id}`)}>Continuar</Botao>
                </Cartao>
              </li>
            ))}
          </ul>
        </section>
      )}

      {modelosAvulsos.length > 0 && (
        <Cartao>
          <h2 className="mb-2 font-semibold">Fazer um checklist fora da agenda</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">Modelo</span>
              <select className={classeEntrada} value={avulso} onChange={(e) => setAvulso(e.target.value)}>
                <option value="">Escolha o modelo…</option>
                {modelosAvulsos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </label>
            <Botao variante="secundario" disabled={!avulso} carregando={abrindo === avulso} onClick={() => abrir(null, avulso)}>
              <ClipboardPlus className="size-5" aria-hidden /> Começar
            </Botao>
          </div>
        </Cartao>
      )}
    </div>
  );
}
