// Execução de um checklist: itens por seção, condicionais, prazos por item, fotos, observações.
// Início registrado ao abrir; fim ao concluir (tela Concluir). Tudo salvo no aparelho na hora.
// Tempos: cada item começa no 1º toque e termina quando fica completo; app em 2º plano ou sair da tela = pausa
// (o tempo ativo não conta o tempo parado).
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { AlarmClock, ArrowRight, Camera, ChevronDown, Clock, FileDown, FileText, Info, MessageSquare, Pause, Timer } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { instanteDoDia } from "../domain/agenda";
import { itemVisivel, mapaRespostas, naoConforme, pontuacaoExecucao, progresso, semResposta, textoPontuacao, todosItens } from "../domain/regras";
import { dataSP, diaSemana, duracao, horaSP } from "../domain/tempo";
import { duracaoItemSeg, tempoAtivoSeg } from "../domain/tempos";
import { usePausaAutomatica } from "../app/pausa-automatica";
import type { Item, Resposta, ValorResposta } from "../domain/tipos";
import type { ExecucaoLocal } from "../data/local";
import { nomeSetor } from "../data/seed-modelos";
import { Aviso, Botao, Cartao, Carregando, Selo, classeEntrada, cx } from "../ui/base";
import { CampoResposta } from "../ui/CampoResposta";
import { SeloExecucao } from "../ui/estados";
import { FotosItem } from "../ui/FotosItem";
import { servidor } from "../data/conexao";
import { baixarPdfExecucao } from "../lib/pdf-execucao";
import { ItemAssinatura } from "../ui/ItemAssinatura";

/** Relógio da tela: atualiza de tempos em tempos enquanto houver algo correndo. */
function useAgora(ligado: boolean, ms = 5000) {
  const [agora, setAgora] = useState(() => new Date().toISOString());
  useEffect(() => {
    if (!ligado) return;
    setAgora(new Date().toISOString());
    const t = setInterval(() => setAgora(new Date().toISOString()), ms);
    return () => clearInterval(t);
  }, [ligado, ms]);
  return agora;
}

/** Tempo ATIVO da execução (total menos pausas) e o tempo parado. */
function Cronometro({ e, agora }: { e: ExecucaoLocal; agora: string }) {
  const parado = (e.tempo_pausado_seg ?? 0);
  return (
    <span className="inline-flex items-center gap-1" title="Tempo ativo (sem as pausas)">
      <Timer className="size-4" aria-hidden /> {duracao(tempoAtivoSeg(e, agora))}
      {parado > 0 && <span className="text-gray-500">(parado {duracao(parado)})</span>}
    </span>
  );
}

/** Linha de tempo do item: hora de início, hora de fim e duração (padrão, se houver). */
function TempoItem({ r, item, agora }: { r: Resposta | undefined; item: Item; agora: string }) {
  if (!r?.iniciado_em) {
    return item.tempo_padrao_min ? <p className="mt-2 text-xs text-gray-500">Padrão: {item.tempo_padrao_min} min</p> : null;
  }
  const seg = duracaoItemSeg(r, agora);
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-gray-600" data-testid={`tempo-${item.id}`}>
      <Clock className="size-3.5" aria-hidden />
      <span>{[
        `Início ${horaSP(r.iniciado_em)}`,
        r.concluido_em ? `Fim ${horaSP(r.concluido_em)}` : "em andamento",
        duracao(seg),
        item.tempo_padrao_min ? `padrão ${item.tempo_padrao_min} min` : null,
      ].filter(Boolean).join(" · ")}</span>
    </p>
  );
}

export default function Execucao() {
  const { id } = useParams();
  const { sessao, lojaAtual } = useApp();
  const { db, repo } = useDados();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [erro, setErro] = useState<string | null>(null);
  const [obsAberta, setObsAberta] = useState<Record<string, boolean>>({});

  const d = useLiveQuery(async () => {
    const e = await db.execucoes.get(id!);
    if (!e) return { e: null };
    const v = await db.versoes.get(e.versao_id);
    const m = await db.modelos.get(e.modelo_id);
    const t = e.tarefa_id ? await db.tarefas.get(e.tarefa_id) : undefined;
    const rs = await db.respostas.where("execucao_id").equals(e.id).toArray();
    const fotos = await repo.fotosPorItem(e.id);
    return { e, v, m, t, rs, fotos };
  }, [id]);

  // execução de outra pessoa (ex.: o líder conferindo) ou só no servidor: traz respostas e fotos
  // e também quando a execução ainda NÃO está no aparelho (link direto, relatório, download não terminou)
  const [buscou, setBuscou] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  useEffect(() => { setBuscou(false); setErroBusca(null); }, [id]);
  useEffect(() => {
    if (!d || buscou) return;
    const naoTem = !d.e;
    const deOutro = !!d.e && d.e.usuario_id !== sessao!.usuario_id;
    const semRespostas = !!d.e && d.rs !== undefined && d.rs.length === 0 && d.e.status !== "em_andamento";
    if (!naoTem && !deOutro && !semRespostas) return;
    setBuscou(true);
    setBuscando(true);
    // no sucesso continua "carregando" até a consulta do aparelho enxergar a execução (sem piscar "não encontrada")
    repo.trazerDoServidor(id!).catch((x: Error) => { setErroBusca(x.message); setBuscando(false); });
  }, [d, buscou, repo, sessao, id]);

  // rola até o item pedido (link das pendências: #item-<id>)
  useEffect(() => {
    if (!hash || !d?.e) return;
    const el = document.getElementById(hash.slice(1));
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); (el.querySelector("button, input, textarea") as HTMLElement | null)?.focus({ preventScroll: true }); }
  }, [hash, d?.e]);

  const meu = !!d?.e && d.e.usuario_id === sessao!.usuario_id && (d.e.status === "em_andamento" || d.e.status === "devolvida");
  usePausaAutomatica(repo, d?.e?.id, meu);
  const agora = useAgora(meu);

  if (!d || (!d.e && (buscando || !buscou))) return <Carregando />;
  if (!d.e) return <Aviso tom="erro" titulo="Execução não encontrada">Ela não existe ou é de uma unidade em que você não está. Volte para Minhas tarefas.{erroBusca ? ` (${erroBusca})` : ""}</Aviso>;
  if (!d.v) return <Aviso tom="alerta" titulo="Modelo ainda não baixado">Conecte à internet e toque em Atualizar.</Aviso>;
  const { e, v, m, t, rs, fotos } = d;

  const editavel = e.usuario_id === sessao!.usuario_id && (e.status === "em_andamento" || e.status === "devolvida");
  const dataRef = t?.data_ref ?? dataSP(e.inicio_em);
  const dow = diaSemana(dataRef);
  const itens = todosItens(v.conteudo);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const mapa = mapaRespostas(rs);
  const prog = progresso(v.conteudo, rs, dow, fotos);
  const nota = pontuacaoExecucao(v.conteudo, rs, dow);

  async function salvar(item: Item, valor: ValorResposta | null) {
    setErro(null);
    try { await repo.responder(e.id, item.id, valor); } catch (x) { setErro((x as Error).message); }
  }
  /** 1º toque no item (ou foco pelo teclado): marca o início dele. */
  function iniciarItem(item: Item, r: Resposta | undefined) {
    if (!editavel || r?.iniciado_em) return;
    void repo.iniciarItem(e.id, item.id).catch((x: Error) => setErro(x.message));
  }
  async function salvarObs(item: Item, texto: string) {
    setErro(null);
    try { await repo.observar(e.id, item.id, texto); } catch (x) { setErro((x as Error).message); }
  }

  return (
    <div className="space-y-4 pb-24">
      <Cartao>
        <div className="text-lg font-bold leading-tight">{m?.nome ?? "Checklist"}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700">
          <SeloExecucao s={e.status} />
          <span>Versão {v.numero}</span>
          <span>Início {horaSP(e.inicio_em)}{e.fim_em ? ` · Fim ${horaSP(e.fim_em)}` : ""}</span>
          <Cronometro e={e} agora={agora} />
          {e.pausa_desde && <span className="inline-flex items-center gap-1 text-amber-800"><Pause className="size-4" aria-hidden /> Pausado</span>}
          {t && <span>Prazo {horaSP(t.prazo)}</span>}
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-sm"><span>{prog.feitos} de {prog.total} itens</span><span>Nota: {textoPontuacao(nota)}</span></div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.feitos} aria-label="Progresso">
            <div className="h-full bg-marca" style={{ width: `${prog.total ? (100 * prog.feitos) / prog.total : 0}%` }} />
          </div>
        </div>
      </Cartao>

      {e.status === "devolvida" && <Aviso tom="alerta" titulo="Devolvida pelo líder">{e.motivo_devolucao}</Aviso>}
      {!editavel && e.status !== "devolvida" && <Aviso tom="info">Somente leitura: esta execução já foi concluída ou é de outra pessoa.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {erroBusca && <Aviso tom="alerta">Não foi possível buscar as respostas no servidor ({erroBusca}). Mostrando o que está no aparelho.</Aviso>}

      {v.conteudo.secoes.map((s) => {
        const visiveis = s.itens.filter((i) => itemVisivel(porId.get(i.id)!, porId, mapa, dow));
        if (!visiveis.length) return null;
        return (
          <section key={s.id} aria-labelledby={`sec-${s.id}`} className="space-y-3">
            <h2 id={`sec-${s.id}`} className="sticky top-[var(--altura-topo,64px)] z-10 -mx-3 bg-[#f4f6f5]/95 px-3 py-2 text-base font-bold text-marca">
              {s.titulo} <span className="text-sm font-normal text-gray-600">· {nomeSetor(s.setor)}</span>
            </h2>
            {visiveis.map((i0) => {
              const i = porId.get(i0.id)!;
              const r = mapa.get(i.id);
              const nc = naoConforme(i, r?.valor);
              const exigeFoto = i.tipo === "foto" ? i.obrigatorio : i.foto === "sempre" || (i.foto === "se_nao_conforme" && nc);
              const exigeObs = i.observacao === "sempre" || (i.observacao === "se_nao_conforme" && nc);
              const prazo = i.prazo_hora ? instanteDoDia(dataRef, i.prazo_hora) : null;
              const prazoVencido = prazo && new Date(prazo) < new Date() && semResposta(r?.valor);
              const mostrarObs = exigeObs || obsAberta[i.id] || !!r?.observacao;
              return (
                <Cartao key={i.id} id={`item-${i.id}`} className={cx("scroll-mt-28", nc && "border-red-300")}
                  onPointerDownCapture={() => iniciarItem(i, r)} onFocusCapture={() => iniciarItem(i, r)}>
                  <div className="mb-2 font-medium leading-snug">{i.texto}</div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {i.obrigatorio && <Selo tom="neutro">Obrigatório</Selo>}
                    {i.foto === "sempre" && <Selo tom="info" icone={Camera}>Foto obrigatória</Selo>}
                    {i.foto === "se_nao_conforme" && <Selo tom="neutro" icone={Camera}>Foto se não conforme</Selo>}
                    {i.ref_ciss && <Selo tom="neutro" icone={FileText}>Rel. CISS {i.ref_ciss}</Selo>}
                    {i.prazo_hora && (prazoVencido ? <Selo tom="erro" icone={AlarmClock}>Prazo {i.prazo_hora} vencido</Selo> : <Selo tom="alerta" icone={AlarmClock}>Prazo {i.prazo_hora}</Selo>)}
                    {i.condicao && <Selo tom="info" icone={ArrowRight}>Pergunta extra</Selo>}
                  </div>
                  {i.ajuda && (
                    <details className="mb-3 rounded-lg bg-gray-50 p-2 text-sm text-gray-700">
                      <summary className="flex min-h-10 cursor-pointer items-center gap-1 font-semibold"><Info className="size-4" aria-hidden /> Como fazer <ChevronDown className="size-4" aria-hidden /></summary>
                      <p className="mt-1">{i.ajuda}</p>
                    </details>
                  )}
                  {i.tipo === "assinatura"
                    ? <ItemAssinatura execId={e.id} itemId={i.id} valor={r?.valor} editavel={editavel} />
                    : <CampoResposta item={i} valor={r?.valor} somenteLeitura={!editavel} onChange={(x) => salvar(i, x)} />}
                  {(i.tipo === "foto" || i.foto !== "nunca" || (fotos.get(i.id) ?? 0) > 0) && (
                    <div className="mt-3"><FotosItem execId={e.id} itemId={i.id} editavel={editavel} obrigatoria={exigeFoto} /></div>
                  )}
                  {mostrarObs ? (
                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block font-semibold">{exigeObs ? "Observação (obrigatória)" : "Observação"}</span>
                      <textarea key={`${i.id}-${r?.observacao ?? ""}`} defaultValue={r?.observacao ?? ""} disabled={!editavel} onBlur={(ev) => { if ((ev.target.value || "") !== (r?.observacao ?? "")) void salvarObs(i, ev.target.value); }}
                        className={cx(classeEntrada, "min-h-20 py-2")} placeholder={nc ? "O que está errado? O que precisa ser feito?" : ""} />
                    </label>
                  ) : editavel && (
                    <Botao variante="fantasma" className="mt-2" onClick={() => setObsAberta((o) => ({ ...o, [i.id]: true }))}>
                      <MessageSquare className="size-5" aria-hidden /> Adicionar observação
                    </Botao>
                  )}
                  <TempoItem r={r} item={i} agora={agora} />
                </Cartao>
              );
            })}
          </section>
        );
      })}

      {editavel && (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-white p-3 lg:bottom-0">
          <div className="mx-auto max-w-3xl">
            <Botao grande onClick={() => navigate(`/execucao/${e.id}/concluir`)}>Revisar e concluir <ArrowRight className="size-5" aria-hidden /></Botao>
          </div>
        </div>
      )}
      {!editavel && (
        <div className="flex flex-wrap items-center gap-3">
          {(e.status === "concluida" || e.status === "validada") && (
            <Botao variante="secundario" onClick={() => baixarPdfExecucao(e.id, db, servidor, lojaAtual?.nome ?? "").catch((x: Error) => setErro(`PDF não gerado: ${x.message}`))}>
              <FileDown className="size-5" aria-hidden /> Baixar PDF
            </Botao>
          )}
          <Link to="/" className="inline-flex min-h-12 items-center font-semibold text-marca underline">Voltar para Minhas tarefas</Link>
        </div>
      )}
    </div>
  );
}
