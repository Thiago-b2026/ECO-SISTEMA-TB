// Ações feitas no aparelho. Tudo grava primeiro no banco local e entra na fila (offline-first).
import { idPlano, novoId } from "../domain/ids";
import { itemCompleto, itensParaPlano, mapaRespostas, pendencias, pontuacaoExecucao, todosItens, type Pendencia } from "../domain/regras";
import { aplicarAcaoPlano, type AcaoPlano, type ArgsAcaoPlano } from "../domain/situacao";
import { dataSP, diaSemana } from "../domain/tempo";
import type { ModeloVersao, PlanoAcao, Resposta, Tarefa, ValorResposta } from "../domain/tipos";
import { obterPosicao } from "../lib/gps";
import type { ExecucaoLocal, FotoLocal } from "./local";
import { equipeDaLoja, responsavelPadrao } from "./equipe";
import type { NovoPlano } from "./servidor";
import type { Sincronizador } from "./sync";

export class Repositorio {
  constructor(private readonly s: Sincronizador) {}

  private get db() { return this.s.db; }
  get usuario() { return this.s.usuario; }

  async versaoPublicada(modeloId: string): Promise<ModeloVersao | undefined> {
    return (await this.db.versoes.where("modelo_id").equals(modeloId).toArray()).find((v) => v.status === "publicada");
  }

  /** Dia da semana que vale para a execução (data da tarefa ou do início, em SP). */
  async diaDaExecucao(e: ExecucaoLocal): Promise<number> {
    const t = e.tarefa_id ? await this.db.tarefas.get(e.tarefa_id) : undefined;
    return diaSemana(t?.data_ref ?? dataSP(e.inicio_em));
  }

  /** Começa (ou continua) a execução de uma tarefa ou de um modelo avulso. Início registrado automaticamente. */
  async iniciar(args: { tarefa?: Tarefa; modeloId: string; lojaId: string }): Promise<string> {
    if (args.tarefa) {
      const aberta = (await this.db.execucoes.where("tarefa_id").equals(args.tarefa.id).toArray())
        .find((e) => e.usuario_id === this.usuario && (e.status === "em_andamento" || e.status === "devolvida"));
      if (aberta) return aberta.id;
    }
    const v = await this.versaoPublicada(args.modeloId);
    if (!v) throw new Error("Este modelo não tem versão publicada no aparelho. Conecte à internet para atualizar.");
    const e: ExecucaoLocal = {
      id: novoId(), tarefa_id: args.tarefa?.id ?? null, modelo_id: args.modeloId, versao_id: v.id, loja_id: args.lojaId,
      usuario_id: this.usuario, inicio_em: new Date().toISOString(), status: "em_andamento",
    };
    await this.db.execucoes.add(e);
    await this.s.enfileirar({ tipo: "execucao", chave: e.id, dados: {} });
    // localização do início, sem travar
    void obterPosicao().then(async (p) => {
      if (p) {
        await this.db.execucoes.update(e.id, { lat: p.lat, lng: p.lng, precisao_m: p.precisao_m } as Partial<ExecucaoLocal>);
        await this.s.enfileirar({ tipo: "execucao", chave: e.id, dados: {} });
      }
    });
    return e.id;
  }

  private async editavel(execId: string) {
    const e = await this.db.execucoes.get(execId);
    if (!e) throw new Error("Execução não encontrada.");
    if (e.usuario_id !== this.usuario) throw new Error("Esta execução é de outra pessoa.");
    if (e.status !== "em_andamento" && e.status !== "devolvida") throw new Error("Esta execução já foi concluída.");
    return e;
  }

  /** Responde (ou altera) um item. */
  async responder(execId: string, itemId: string, valor: ValorResposta | null, observacao?: string | null) {
    await this.editavel(execId);
    const atual = await this.db.respostas.where("[execucao_id+item_id]").equals([execId, itemId]).first();
    const agora = new Date().toISOString();
    const r: Resposta = {
      id: atual?.id ?? novoId(), execucao_id: execId, item_id: itemId,
      valor: valor === undefined ? atual?.valor ?? null : valor,
      observacao: observacao === undefined ? atual?.observacao ?? null : observacao,
      respondido_em: agora, lat: atual?.lat ?? null, lng: atual?.lng ?? null,
      iniciado_em: atual?.iniciado_em ?? agora, concluido_em: atual?.concluido_em ?? null,
    };
    await this.db.respostas.put(r);
    await this.atualizarFimDoItem(execId, itemId);
    await this.s.enfileirar({ tipo: "execucao", chave: execId, dados: {} });
  }

  /** 1º toque/abertura do item: grava o INÍCIO (uma vez só; nunca é sobrescrito). */
  async iniciarItem(execId: string, itemId: string) {
    const e = await this.db.execucoes.get(execId);
    if (!e || e.usuario_id !== this.usuario || (e.status !== "em_andamento" && e.status !== "devolvida")) return;
    const atual = await this.db.respostas.where("[execucao_id+item_id]").equals([execId, itemId]).first();
    if (atual?.iniciado_em) return;
    const agora = new Date().toISOString();
    if (atual) await this.db.respostas.update(atual.id, { iniciado_em: agora });
    else await this.db.respostas.put({ id: novoId(), execucao_id: execId, item_id: itemId, valor: null, observacao: null, respondido_em: agora, iniciado_em: agora, concluido_em: null });
    await this.s.enfileirar({ tipo: "execucao", chave: execId, dados: {} });
  }

  /** Marca o FIM do item quando ele fica completo (resposta + foto + observação exigidas); limpa se deixar de estar. */
  private async atualizarFimDoItem(execId: string, itemId: string) {
    const e = await this.db.execucoes.get(execId);
    const v = e ? await this.db.versoes.get(e.versao_id) : undefined;
    const item = v ? todosItens(v.conteudo).find((i) => i.id === itemId) : undefined;
    if (!item) return;
    const r = await this.db.respostas.where("[execucao_id+item_id]").equals([execId, itemId]).first();
    const nFotos = (await this.fotosPorItem(execId)).get(itemId) ?? 0;
    const completo = itemCompleto(item, r, nFotos);
    const agora = new Date().toISOString();
    if (!r) {
      if (completo) await this.db.respostas.put({ id: novoId(), execucao_id: execId, item_id: itemId, valor: null, observacao: null, respondido_em: agora, iniciado_em: agora, concluido_em: agora });
      return;
    }
    if (completo && !r.concluido_em) await this.db.respostas.update(r.id, { concluido_em: agora, iniciado_em: r.iniciado_em ?? agora, respondido_em: agora });
    else if (completo && r.concluido_em) { /* já completo: o fim continua o da 1ª vez que completou */ }
    else if (!completo && r.concluido_em) await this.db.respostas.update(r.id, { concluido_em: null, respondido_em: agora });
  }

  /** Pausa: app foi para 2º plano ou a pessoa saiu da tela (o tempo parado fica fora do tempo ativo). */
  async pausar(execId: string) {
    const e = await this.db.execucoes.get(execId);
    if (!e || e.usuario_id !== this.usuario || (e.status !== "em_andamento" && e.status !== "devolvida") || e.pausa_desde) return;
    await this.db.execucoes.update(execId, { pausa_desde: new Date().toISOString() });
  }

  /** Volta da pausa: soma o tempo parado e registra a pausa. */
  async retomar(execId: string) {
    const e = await this.db.execucoes.get(execId);
    if (!e?.pausa_desde) return;
    const fim = new Date().toISOString();
    const seg = Math.max(0, Math.round((new Date(fim).getTime() - new Date(e.pausa_desde).getTime()) / 1000));
    await this.db.execucoes.update(execId, {
      pausa_desde: null,
      tempo_pausado_seg: (e.tempo_pausado_seg ?? 0) + seg,
      pausas: [...(e.pausas ?? []), { inicio: e.pausa_desde, fim }],
    });
    if (seg > 0) await this.s.enfileirar({ tipo: "execucao", chave: execId, dados: {} });
  }

  async observar(execId: string, itemId: string, texto: string) {
    const atual = await this.db.respostas.where("[execucao_id+item_id]").equals([execId, itemId]).first();
    await this.responder(execId, itemId, atual?.valor ?? null, texto);
  }

  /** Guarda a foto (já comprimida e carimbada) no aparelho e põe na fila. */
  async adicionarFoto(execId: string, itemId: string | null, blob: Blob, tiradaEm: string, pos: { lat: number; lng: number; precisao_m: number } | null, tipo: "foto" | "assinatura" = "foto") {
    const e = await this.editavel(execId);
    const id = novoId();
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    const f: FotoLocal = {
      id, execucao_id: execId, item_id: itemId, storage_path: `${e.loja_id}/${execId}/${id}.${ext}`, mime: blob.type || "image/jpeg",
      bytes: blob.size, tirada_em: tiradaEm, lat: pos?.lat ?? null, lng: pos?.lng ?? null, precisao_m: pos?.precisao_m ?? null,
      blob, enviada: false, tipo,
    };
    await this.db.fotos.add(f);
    if (itemId && tipo === "foto") {
      await this.iniciarItem(execId, itemId);
      await this.atualizarFimDoItem(execId, itemId);
    }
    await this.s.enfileirar({ tipo: "execucao", chave: execId, dados: {} });
    return f;
  }

  /** Apaga uma foto que AINDA NÃO foi enviada (depois de enviada, nada é apagado). */
  async removerFoto(fotoId: string) {
    const f = await this.db.fotos.get(fotoId);
    if (!f) return;
    if (f.enviada) throw new Error("Esta foto já foi enviada e não pode ser apagada.");
    await this.db.fotos.delete(fotoId);
    if (f.execucao_id && f.item_id) await this.atualizarFimDoItem(f.execucao_id, f.item_id);
    await this.s.marcarSalvo();
  }

  async fotosPorItem(execId: string) {
    const m = new Map<string, number>();
    for (const f of await this.db.fotos.where("execucao_id").equals(execId).toArray()) {
      if (f.item_id && f.tipo !== "assinatura") m.set(f.item_id, (m.get(f.item_id) ?? 0) + 1);
    }
    return m;
  }

  async pendencias(execId: string): Promise<Pendencia[]> {
    const e = await this.db.execucoes.get(execId);
    if (!e) return [];
    const v = await this.db.versoes.get(e.versao_id);
    if (!v) return [];
    const rs = await this.db.respostas.where("execucao_id").equals(execId).toArray();
    return pendencias(v.conteudo, rs, await this.fotosPorItem(execId), await this.diaDaExecucao(e));
  }

  /**
   * Conclui no aparelho: bloqueia com pendências (regra F), registra o fim, calcula a nota,
   * cria os planos automáticos (mesmo id do servidor) e põe na fila.
   */
  async concluir(execId: string, assinatura: Blob | null): Promise<{ pontuacao: number | null; planos: number }> {
    await this.retomar(execId); // fecha uma pausa aberta antes de registrar o fim
    const e = await this.editavel(execId);
    const pend = await this.pendencias(execId);
    if (pend.length) throw new Error(`Ainda há ${pend.length} pendência(s) obrigatória(s).`);
    const pos = await obterPosicao(4000);
    let assinaturaId: string | null = null;
    if (assinatura) assinaturaId = (await this.adicionarFoto(execId, "__assinatura", assinatura, new Date().toISOString(), pos, "assinatura")).id;
    const v = (await this.db.versoes.get(e.versao_id))!;
    const rs = await this.db.respostas.where("execucao_id").equals(execId).toArray();
    const dow = await this.diaDaExecucao(e);
    const p = pontuacaoExecucao(v.conteudo, rs, dow);
    const fim = new Date().toISOString();
    // planos automáticos no aparelho (o servidor cria os mesmos, com o mesmo id)
    const responsavel = responsavelPadrao(await equipeDaLoja(this.db, e.loja_id));
    const mapa = mapaRespostas(rs);
    const itens = itensParaPlano(v.conteudo, rs, dow);
    for (const item of itens) {
      const id = idPlano(execId, item.id);
      if (await this.db.planos.get(id)) continue;
      await this.db.planos.put({
        id, execucao_id: execId, item_id: item.id, loja_id: e.loja_id, setor: item.setor ?? null, titulo: item.texto.slice(0, 200),
        descricao: mapa.get(item.id)?.observacao ?? null, responsavel_id: responsavel,
        prazo: new Date(new Date(fim).getTime() + 86400000).toISOString(), status: "aberto", criado_por: this.usuario, criado_em: fim, local: true,
      });
    }
    await this.db.execucoes.update(execId, {
      status: "concluida", fim_em: fim, pontuacao: p.percentual, conclusao_pendente: true, assinatura_foto_id: assinaturaId,
      lat: e.lat ?? pos?.lat ?? null, lng: e.lng ?? pos?.lng ?? null,
    });
    if (e.tarefa_id) await this.db.tarefas.update(e.tarefa_id, { concluida_em: fim, execucao_id: execId });
    await this.s.enfileirar({ tipo: "execucao", chave: execId, dados: {} });
    return { pontuacao: p.percentual, planos: itens.length };
  }

  /** Abre uma execução que está só no servidor (ex.: devolvida pelo líder) trazendo respostas e fotos. */
  async trazerDoServidor(execId: string) {
    const d = await this.s.srv.detalheExecucao(execId);
    await this.db.transaction("rw", [this.db.execucoes, this.db.respostas, this.db.fotos], async () => {
      const local = await this.db.execucoes.get(execId);
      await this.db.execucoes.put({ ...local, ...d.execucao, conclusao_pendente: false });
      for (const r of d.respostas) {
        const atual = await this.db.respostas.where("[execucao_id+item_id]").equals([execId, r.item_id]).first();
        if (!atual || atual.respondido_em <= r.respondido_em) await this.db.respostas.put({ ...r, id: atual?.id ?? r.id });
      }
      for (const f of d.fotos) if (!(await this.db.fotos.get(f.id))) await this.db.fotos.put({ ...f, enviada: true, blob: null, tipo: f.item_id === "__assinatura" ? "assinatura" : "foto" });
    });
  }

  // ---------------------------------------------------------------- validação e tarefas (supervisor)
  async validarExecucao(execId: string, aprovar: boolean, motivo?: string) {
    if (!aprovar && !motivo?.trim()) throw new Error("Informe o motivo da devolução.");
    const e = await this.db.execucoes.get(execId);
    if (e?.usuario_id === this.usuario) throw new Error("Você não pode validar a sua própria execução.");
    if (e) await this.db.execucoes.update(execId, aprovar ? { status: "validada", validado_por: this.usuario } : { status: "devolvida", motivo_devolucao: motivo!.trim() });
    await this.s.enfileirar({ tipo: "validar_execucao", chave: execId, dados: { aprovar, motivo: motivo ?? null } });
  }

  async cancelarTarefa(tarefaId: string, motivo: string) {
    if (!motivo.trim()) throw new Error("Informe o motivo do cancelamento.");
    await this.db.tarefas.update(tarefaId, { cancelada_em: new Date().toISOString(), motivo_cancelamento: motivo.trim() });
    await this.s.enfileirar({ tipo: "cancelar_tarefa", chave: tarefaId, dados: { motivo: motivo.trim() } });
  }

  // ---------------------------------------------------------------- planos de ação
  async acaoPlano(planoId: string, acao: AcaoPlano, supervisor: boolean, args: ArgsAcaoPlano = {}) {
    const p = await this.db.planos.get(planoId);
    if (!p) throw new Error("Plano de ação não encontrado.");
    const novo = aplicarAcaoPlano(p, acao, this.usuario, supervisor, args); // mesmas regras do banco (lança erro)
    if (novo !== p) await this.db.planos.put(novo);
    await this.s.enfileirar({ tipo: "plano_acao", chave: planoId, dados: { acao, args } });
  }

  async criarPlano(p: Omit<NovoPlano, "id">) {
    if (!p.titulo.trim()) throw new Error("Informe o título.");
    const novo: NovoPlano = { ...p, id: novoId() };
    const local: PlanoAcao & { local: boolean } = { ...novo, execucao_id: null, item_id: null, status: "aberto", criado_por: this.usuario, criado_em: new Date().toISOString(), local: true };
    await this.db.planos.put(local);
    await this.s.enfileirar({ tipo: "plano_criar", chave: novo.id, dados: { plano: novo } });
    return novo.id;
  }

  async fotoPlano(planoId: string, blob: Blob, tiradaEm: string, pos: { lat: number; lng: number; precisao_m: number } | null) {
    const p = await this.db.planos.get(planoId);
    if (!p) throw new Error("Plano de ação não encontrado.");
    const id = novoId();
    const f: FotoLocal = {
      id, execucao_id: null, item_id: null, plano_id: planoId, storage_path: `${p.loja_id}/planos/${planoId}/${id}.jpg`, mime: blob.type || "image/jpeg",
      bytes: blob.size, tirada_em: tiradaEm, lat: pos?.lat ?? null, lng: pos?.lng ?? null, precisao_m: pos?.precisao_m ?? null, blob, enviada: false,
    };
    await this.db.fotos.add(f);
    await this.s.enfileirar({ tipo: "plano_foto", chave: id, dados: {} });
  }
}
