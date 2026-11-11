// Detalhe do plano: ações permitidas (regra D), justificativas obrigatórias, foto da solução e histórico (regra E).
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { equipeDaLoja } from "../data/equipe";
import { ArrowLeft, Ban, Camera, CheckCircle2, History, Pencil, Play, Send, Undo2 } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { servidor } from "../data/conexao";
import { nivel, type Historico } from "../data/servidor";
import { nomeSetor } from "../data/seed-modelos";
import { acoesPlano, type AcaoPlano } from "../domain/situacao";
import { dataHoraSP, dataSP, instanteSP } from "../domain/tempo";
import { legendaFoto, processarFoto } from "../lib/foto";
import { obterPosicao } from "../lib/gps";
import { Aviso, Botao, Campo, Cartao, Carregando, Titulo, classeEntrada, cx } from "../ui/base";
import { SeloPlano } from "../ui/estados";
import { Miniatura } from "../ui/FotosItem";

const ROTULO_HIST: Record<string, string> = {
  criado_automatico: "Criado automaticamente (item não conforme)", criado: "Criado", iniciado: "Iniciado", solucao_enviada: "Solução enviada",
  validado: "Validado e concluído", rejeitado: "Rejeitado (volta para em andamento)", cancelado: "Cancelado", alterado: "Prazo/responsável alterado",
};

export default function PlanoDetalhe() {
  const { id } = useParams();
  const { perfil, sessao } = useApp();
  const { db, repo, sinc } = useDados();
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<AcaoPlano | null>(null);
  const [texto, setTexto] = useState("");
  const [novoPrazo, setNovoPrazo] = useState("");
  const [novoResp, setNovoResp] = useState<string>("");
  const [hist, setHist] = useState<Historico[] | null>(null);
  const [erroHist, setErroHist] = useState<string | null>(null);
  const foto = useRef<HTMLInputElement>(null);

  const d = useLiveQuery(async () => {
    const p = await db.planos.get(id!);
    if (!p) return { p: null };
    const membros = await equipeDaLoja(db, p.loja_id);
    const fotos = await db.fotos.where("plano_id").equals(p.id).toArray();
    const pendente = (await db.fila.where("chave").equals(p.id).count()) > 0;
    return { p, membros, fotos, pendente };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    servidor.historico(id).then(setHist).catch((e: Error) => setErroHist(e.message));
  }, [id, d?.p?.status, sinc.estado.enviadoEm]);

  if (!d) return <Carregando />;
  if (!d.p) return <Aviso tom="erro">Plano de ação não encontrado neste aparelho.</Aviso>;
  const { p, membros, fotos, pendente } = d;
  const usuario = sessao!.usuario_id;
  const supervisor = nivel(perfil) >= 2;
  const acoes = acoesPlano(p, usuario, supervisor);
  const nome = (u: string | null | undefined) => membros.find((m) => m.usuario_id === u)?.nome ?? (u ? "—" : "Sem responsável");

  async function fazer(acao: AcaoPlano) {
    setErro(null);
    try {
      if (acao === "alterar") {
        await repo.acaoPlano(p.id, "alterar", supervisor, { texto, prazo: novoPrazo ? instanteSP(novoPrazo, "18:00") : p.prazo, responsavel_id: novoResp === "" ? p.responsavel_id : novoResp === "-" ? null : novoResp });
      } else {
        await repo.acaoPlano(p.id, acao, supervisor, { texto });
      }
      setModo(null);
      setTexto("");
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function anexar(f: File | undefined) {
    if (!f) return;
    setErro(null);
    try {
      const tiradaEm = new Date().toISOString();
      const pos = await obterPosicao();
      await repo.fotoPlano(p.id, await processarFoto(f, legendaFoto(tiradaEm, pos, "Solução")), tiradaEm, pos);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      if (foto.current) foto.current.value = "";
    }
  }

  const formulario: Partial<Record<AcaoPlano, { titulo: string; rotulo: string; botao: string; perigo?: boolean }>> = {
    enviar_solucao: { titulo: "Enviar solução", rotulo: "O que foi feito?", botao: "Enviar para validação" },
    rejeitar: { titulo: "Rejeitar a solução", rotulo: "Justificativa (obrigatória)", botao: "Rejeitar e devolver", perigo: true },
    cancelar: { titulo: "Cancelar o plano", rotulo: "Motivo (obrigatório)", botao: "Cancelar plano", perigo: true },
    alterar: { titulo: "Trocar prazo ou responsável", rotulo: "Justificativa (obrigatória)", botao: "Salvar alteração" },
  };
  const f = modo ? formulario[modo] : undefined;

  return (
    <div className="space-y-4">
      <Link to="/planos" className="inline-flex min-h-12 items-center gap-1 font-semibold text-marca"><ArrowLeft className="size-5" aria-hidden /> Planos de ação</Link>
      <Titulo>{p.titulo}</Titulo>
      <Cartao className="space-y-2 text-sm">
        <SeloPlano p={p} />
        {pendente && <Aviso tom="alerta">Alteração salva no aparelho, aguardando envio.</Aviso>}
        <div className="grid gap-2 sm:grid-cols-2">
          <div><span className="text-gray-600">Responsável:</span> <b>{nome(p.responsavel_id)}</b></div>
          <div><span className="text-gray-600">Prazo:</span> <b>{dataHoraSP(p.prazo)}</b></div>
          <div><span className="text-gray-600">Setor:</span> {nomeSetor(p.setor)}</div>
          <div><span className="text-gray-600">Aberto em:</span> {dataHoraSP(p.criado_em)}</div>
        </div>
        {p.descricao && <p><span className="text-gray-600">Detalhes:</span> {p.descricao}</p>}
        {p.execucao_id && p.item_id && <p><Link className="font-semibold text-marca underline" to={`/execucao/${p.execucao_id}#item-${p.item_id}`}>Ver o item no checklist de origem</Link></p>}
        {p.solucao && <p><span className="text-gray-600">Solução:</span> {p.solucao} {p.executado_por && <>— <i>{nome(p.executado_por)}</i></>}</p>}
        {p.motivo_cancelamento && <p><span className="text-gray-600">Motivo do cancelamento:</span> {p.motivo_cancelamento}</p>}
      </Cartao>

      {(fotos.length > 0 || acoes.includes("enviar_solucao")) && (
        <Cartao>
          <h2 className="mb-2 font-semibold">Fotos da solução</h2>
          <div className="flex flex-wrap gap-3">{fotos.map((x) => <Miniatura key={x.id} f={x} />)}</div>
          {acoes.includes("enviar_solucao") && (
            <>
              <input ref={foto} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => anexar(e.target.files?.[0])} />
              <Botao variante="secundario" className="mt-2" onClick={() => foto.current?.click()}><Camera className="size-5" aria-hidden /> Tirar foto da solução</Botao>
            </>
          )}
        </Cartao>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {f ? (
        <Cartao className={cx("space-y-3", f.perigo && "border-red-300")}>
          <h2 className="font-semibold">{f.titulo}</h2>
          {modo === "alterar" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Novo prazo (até 18:00)"><input type="date" className={classeEntrada} value={novoPrazo} min={dataSP()} onChange={(e) => setNovoPrazo(e.target.value)} /></Campo>
              <Campo rotulo="Responsável">
                <select className={classeEntrada} value={novoResp} onChange={(e) => setNovoResp(e.target.value)}>
                  <option value="">(manter: {nome(p.responsavel_id)})</option>
                  <option value="-">Sem responsável</option>
                  {membros.filter((m) => m.ativo).map((m) => <option key={m.usuario_id} value={m.usuario_id}>{m.nome}</option>)}
                </select>
              </Campo>
            </div>
          )}
          <Campo rotulo={f.rotulo}><textarea className={cx(classeEntrada, "min-h-24 py-2")} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>
          <div className="flex flex-wrap gap-2">
            <Botao variante={f.perigo ? "perigo" : "primario"} onClick={() => fazer(modo!)}>{f.botao}</Botao>
            <Botao variante="fantasma" onClick={() => { setModo(null); setTexto(""); }}>Voltar</Botao>
          </div>
        </Cartao>
      ) : (
        <div className="flex flex-wrap gap-2">
          {acoes.includes("iniciar") && <Botao onClick={() => fazer("iniciar")}><Play className="size-5" aria-hidden /> Iniciar</Botao>}
          {acoes.includes("enviar_solucao") && <Botao onClick={() => setModo("enviar_solucao")}><Send className="size-5" aria-hidden /> Enviar solução</Botao>}
          {acoes.includes("validar") && <Botao onClick={() => fazer("validar")}><CheckCircle2 className="size-5" aria-hidden /> Validar e concluir</Botao>}
          {acoes.includes("rejeitar") && <Botao variante="secundario" onClick={() => setModo("rejeitar")}><Undo2 className="size-5" aria-hidden /> Rejeitar</Botao>}
          {acoes.includes("alterar") && <Botao variante="secundario" onClick={() => setModo("alterar")}><Pencil className="size-5" aria-hidden /> Prazo / responsável</Botao>}
          {acoes.includes("cancelar") && <Botao variante="fantasma" onClick={() => setModo("cancelar")}><Ban className="size-5" aria-hidden /> Cancelar</Botao>}
          {p.status === "aguardando_validacao" && p.executado_por === usuario && supervisor && (
            <Aviso tom="info">Você enviou esta solução: outra pessoa (supervisor ou gestor) precisa validar.</Aviso>
          )}
        </div>
      )}

      <Cartao>
        <h2 className="mb-2 flex items-center gap-1 font-semibold"><History className="size-5" aria-hidden /> Histórico</h2>
        {erroHist ? <p className="text-sm text-gray-600">Histórico indisponível sem internet.</p> : !hist ? <Carregando /> : hist.length === 0 ? (
          <p className="text-sm text-gray-600">Ainda sem registros no servidor.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {hist.map((h) => (
              <li key={String(h.id)} className="border-l-4 border-marca-claro pl-3">
                <div><b>{ROTULO_HIST[h.acao] ?? h.acao}</b> · {dataHoraSP(h.data)}</div>
                <div className="text-gray-600">{h.autor_nome ?? nome(h.autor)}</div>
                {h.justificativa && <div>“{h.justificativa}”</div>}
              </li>
            ))}
          </ol>
        )}
      </Cartao>
    </div>
  );
}
