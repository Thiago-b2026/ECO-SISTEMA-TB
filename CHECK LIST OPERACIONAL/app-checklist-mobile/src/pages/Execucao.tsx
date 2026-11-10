// Execução de um checklist: itens por seção, condicionais, prazos por item, fotos, observações.
// Início registrado ao abrir; fim ao concluir (tela Concluir). Tudo salvo no aparelho na hora.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { AlarmClock, ArrowRight, Camera, ChevronDown, FileDown, FileText, Info, MessageSquare, Timer } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { instanteDoDia } from "../domain/agenda";
import { itemVisivel, mapaRespostas, naoConforme, pontuacaoExecucao, progresso, semResposta, textoPontuacao, todosItens } from "../domain/regras";
import { dataSP, diaSemana, duracao, horaSP, segundosEntre } from "../domain/tempo";
import type { Item, ValorResposta } from "../domain/tipos";
import { nomeSetor } from "../data/seed-modelos";
import { Aviso, Botao, Cartao, Carregando, Selo, classeEntrada, cx } from "../ui/base";
import { CampoResposta } from "../ui/CampoResposta";
import { SeloExecucao } from "../ui/estados";
import { FotosItem } from "../ui/FotosItem";
import { servidor } from "../data/conexao";
import { baixarPdfExecucao } from "../lib/pdf-execucao";
import { ItemAssinatura } from "../ui/ItemAssinatura";

function Cronometro({ inicio, fim }: { inicio: string; fim?: string | null }) {
  const [agora, setAgora] = useState(() => new Date().toISOString());
  useEffect(() => {
    if (fim) return;
    const t = setInterval(() => setAgora(new Date().toISOString()), 15000);
    return () => clearInterval(t);
  }, [fim]);
  return <span className="inline-flex items-center gap-1"><Timer className="size-4" aria-hidden /> {duracao(segundosEntre(inicio, fim ?? agora))}</span>;
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
  const [buscou, setBuscou] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  useEffect(() => {
    if (!d?.e || buscou) return;
    const deOutro = d.e.usuario_id !== sessao!.usuario_id;
    const semRespostas = d.rs !== undefined && d.rs.length === 0 && d.e.status !== "em_andamento";
    if (!deOutro && !semRespostas) return;
    setBuscou(true);
    repo.trazerDoServidor(d.e.id).catch((x: Error) => setErroBusca(x.message));
  }, [d?.e, d?.rs, buscou, repo, sessao]);

  // rola até o item pedido (link das pendências: #item-<id>)
  useEffect(() => {
    if (!hash || !d?.e) return;
    const el = document.getElementById(hash.slice(1));
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); (el.querySelector("button, input, textarea") as HTMLElement | null)?.focus({ preventScroll: true }); }
  }, [hash, d?.e]);

  if (!d) return <Carregando />;
  if (!d.e) return <Aviso tom="erro" titulo="Execução não encontrada neste aparelho">Volte para Minhas tarefas e atualize.</Aviso>;
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
          <Cronometro inicio={e.inicio_em} fim={e.fim_em} />
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
            <h2 id={`sec-${s.id}`} className="sticky top-[64px] z-10 -mx-3 bg-[#f4f6f5]/95 px-3 py-2 text-base font-bold text-marca">
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
                <Cartao key={i.id} id={`item-${i.id}`} className={cx("scroll-mt-28", nc && "border-red-300")}>
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
