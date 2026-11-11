// Revisão antes de concluir (regra F): lista de pendências com link para cada item; conclusão BLOQUEADA até resolver.
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Camera, CheckCircle2, MessageSquare, PenLine, Wrench } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados, useEstadoSync } from "../app/dados";
import { itensParaPlano, pendencias, pontuacaoExecucao, textoPontuacao } from "../domain/regras";
import { dataSP, diaSemana, duracao, segundosEntre } from "../domain/tempo";
import { Assinatura, type AssinaturaRef } from "../ui/Assinatura";
import { usePausaAutomatica } from "../app/pausa-automatica";
import { tempoAtivoSeg } from "../domain/tempos";
import { Aviso, Botao, Cartao, Carregando, Titulo } from "../ui/base";

const ICONE = { resposta: PenLine, foto: Camera, observacao: MessageSquare };

export default function Concluir() {
  const { id } = useParams();
  const { sessao } = useApp();
  const { db, repo } = useDados();
  const sync = useEstadoSync();
  const navigate = useNavigate();
  const assinatura = useRef<AssinaturaRef>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ pontuacao: number | null; planos: number } | null>(null);

  const d = useLiveQuery(async () => {
    const e = await db.execucoes.get(id!);
    if (!e) return { e: null };
    const v = await db.versoes.get(e.versao_id);
    const t = e.tarefa_id ? await db.tarefas.get(e.tarefa_id) : undefined;
    const rs = await db.respostas.where("execucao_id").equals(e.id).toArray();
    const fotos = await repo.fotosPorItem(e.id);
    return { e, v, t, rs, fotos };
  }, [id]);

  // revisar e assinar também é tempo ativo: sair desta tela ou mandar o app para 2º plano pausa
  usePausaAutomatica(repo, d?.e?.id, !!d?.e && d.e.usuario_id === sessao!.usuario_id && (d.e.status === "em_andamento" || d.e.status === "devolvida") && !resultado);

  if (!d) return <Carregando />;
  if (!d.e || !d.v) return <Aviso tom="erro">Execução não encontrada neste aparelho.</Aviso>;
  const { e, v, t, rs, fotos } = d;
  const dow = diaSemana(t?.data_ref ?? dataSP(e.inicio_em));
  const pend = pendencias(v.conteudo, rs, fotos, dow);
  const nota = pontuacaoExecucao(v.conteudo, rs, dow);
  const planos = itensParaPlano(v.conteudo, rs, dow);

  if (resultado || e.status === "concluida" || e.status === "validada") {
    const pont = resultado ? { percentual: resultado.pontuacao } : { percentual: e.pontuacao ?? null };
    return (
      <div className="space-y-4">
        <Cartao className="border-green-300 text-center">
          <CheckCircle2 className="mx-auto size-14 text-green-700" aria-hidden />
          <h1 className="mt-2 text-xl font-bold">Checklist concluído</h1>
          <p className="mt-1">Nota: <b>{textoPontuacao(pont)}</b> · Tempo ativo: <b>{duracao(e.fim_em ? tempoAtivoSeg(e) : null)}</b>{(e.tempo_pausado_seg ?? 0) > 0 && <> (total {duracao(segundosEntre(e.inicio_em, e.fim_em!))}, parado {duracao(e.tempo_pausado_seg)})</>}</p>
          {(resultado?.planos ?? 0) > 0 && <p className="mt-1">{resultado!.planos} plano(s) de ação aberto(s) para os itens não conformes.</p>}
        </Cartao>
        {sync.pendentes > 0 && !sync.erro && <Aviso tom="alerta" titulo="Salvo no aparelho">Será enviado assim que houver internet.</Aviso>}
        {sync.erro && <Aviso tom="erro" titulo="Erro ao enviar">{sync.erro}</Aviso>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Botao grande onClick={() => navigate("/")}>Voltar para Minhas tarefas</Botao>
          {(resultado?.planos ?? 0) > 0 && <Botao grande variante="secundario" onClick={() => navigate("/planos")}><Wrench className="size-5" aria-hidden /> Ver planos de ação</Botao>}
        </div>
      </div>
    );
  }

  const editavel = e.usuario_id === sessao!.usuario_id && (e.status === "em_andamento" || e.status === "devolvida");

  async function concluir() {
    setErro(null);
    setEnviando(true);
    try {
      const png = (await assinatura.current?.png()) ?? null;
      if (!png) throw new Error("Assine para concluir.");
      setResultado(await repo.concluir(e.id, png));
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Titulo>Revisar e concluir</Titulo>
      <Link to={`/execucao/${e.id}`} className="inline-flex min-h-12 items-center gap-1 font-semibold text-marca"><ArrowLeft className="size-5" aria-hidden /> Voltar ao checklist</Link>

      <Cartao>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><div className="text-gray-600">Nota parcial</div><div className="text-lg font-bold">{textoPontuacao(nota)}</div></div>
          <div><div className="text-gray-600">Tempo até agora</div><div className="text-lg font-bold">{duracao(segundosEntre(e.inicio_em, new Date().toISOString()))}</div></div>
          <div><div className="text-gray-600">Pendências</div><div className="text-lg font-bold">{pend.length}</div></div>
          <div><div className="text-gray-600">Planos que serão abertos</div><div className="text-lg font-bold">{planos.length}</div></div>
        </div>
      </Cartao>

      {pend.length > 0 ? (
        <Cartao className="border-red-300">
          <h2 className="mb-2 font-bold text-red-900">Resolva antes de concluir ({pend.length})</h2>
          <ul className="divide-y">
            {pend.map((p) => {
              const I = ICONE[p.tipo];
              return (
                <li key={`${p.item_id}-${p.tipo}`}>
                  <Link to={`/execucao/${e.id}#item-${p.item_id}`} className="flex min-h-12 items-center gap-2 py-2 hover:bg-red-50">
                    <I className="size-5 shrink-0 text-red-800" aria-hidden />
                    <span className="min-w-0 flex-1"><b>{p.mensagem}:</b> {p.texto}</span>
                    <span className="text-sm font-semibold text-marca underline">Ir</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Cartao>
      ) : (
        <Aviso tom="ok" titulo="Tudo respondido">Nenhuma pendência obrigatória.</Aviso>
      )}

      {editavel && (
        <Cartao>
          <Assinatura ref={assinatura} rotulo="Assinatura de quem executou" />
        </Cartao>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Botao grande disabled={!editavel || pend.length > 0} carregando={enviando} onClick={concluir}>
        <CheckCircle2 className="size-5" aria-hidden /> {pend.length ? `Concluir (bloqueado: ${pend.length} pendência${pend.length > 1 ? "s" : ""})` : "Concluir checklist"}
      </Botao>
    </div>
  );
}
