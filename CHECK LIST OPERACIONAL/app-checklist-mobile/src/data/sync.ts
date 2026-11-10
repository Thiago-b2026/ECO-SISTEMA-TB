// Fila de sincronização (offline-first).
// - Tudo é gravado no aparelho e entra na fila; a fila envia NA ORDEM, quando há internet.
// - Reenviar não duplica nada (ids gerados no aparelho + funções idempotentes no servidor).
// - Sem internet NÃO é erro: fica "pendente". Erro do servidor É erro, com "Tentar de novo" (regra G).
import { dataSP, somarDias } from "../domain/tempo";
import type { Execucao, Foto } from "../domain/tipos";
import type { BancoLocal, FotoLocal, Operacao } from "./local";
import { ErroServidor, type Servidor } from "./servidor";

export interface EstadoSync {
  online: boolean;
  enviando: boolean;
  pendentes: number;
  /** última gravação no aparelho (ISO) */
  salvoEm: string | null;
  /** último envio confirmado pelo servidor (ISO) */
  enviadoEm: string | null;
  /** última atualização vinda do servidor (ISO) */
  baixadoEm: string | null;
  /** mensagem do erro de envio (null = sem erro) */
  erro: string | null;
}

const semMarcas = (e: Execucao & Record<string, unknown>): Execucao => {
  const { conclusao_pendente: _c, assinatura_foto_id: _a, ...resto } = e;
  return resto as Execucao;
};
const semArquivo = (f: FotoLocal): Foto => {
  const { blob: _b, enviada: _e, tipo: _t, ...resto } = f;
  return resto;
};

export class Sincronizador {
  estado: EstadoSync;
  private ouvintes = new Set<(e: EstadoSync) => void>();
  private rodando: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** unidades usadas no download */
  lojas: string[] = [];

  constructor(public readonly db: BancoLocal, public readonly srv: Servidor, public readonly usuario: string, online = true) {
    this.estado = { online, enviando: false, pendentes: 0, salvoEm: null, enviadoEm: null, baixadoEm: null, erro: null };
  }

  async iniciar() {
    this.estado.salvoEm = (await this.db.lerMeta<string>("salvoEm")) ?? null;
    this.estado.enviadoEm = (await this.db.lerMeta<string>("enviadoEm")) ?? null;
    this.estado.baixadoEm = (await this.db.lerMeta<string>("baixadoEm")) ?? null;
    await this.contar();
  }

  assinar(fn: (e: EstadoSync) => void) {
    this.ouvintes.add(fn);
    fn(this.estado);
    return () => { this.ouvintes.delete(fn); };
  }

  private emitir(parcial: Partial<EstadoSync> = {}) {
    this.estado = { ...this.estado, ...parcial };
    for (const f of this.ouvintes) f(this.estado);
  }

  private async contar() {
    this.emitir({ pendentes: await this.db.fila.count() });
  }

  setOnline(online: boolean) {
    this.emitir({ online });
    if (online) this.agendar(0);
  }

  /** Marca "salvo no aparelho às HH:MM". */
  async marcarSalvo() {
    const agora = new Date().toISOString();
    await this.db.gravarMeta("salvoEm", agora);
    this.emitir({ salvoEm: agora });
  }

  /** Coloca na fila (a mesma execução entra uma vez só) e agenda o envio. */
  async enfileirar(op: Pick<Operacao, "tipo" | "chave" | "dados">) {
    if (op.tipo === "execucao") {
      const ja = await this.db.fila.where("chave").equals(op.chave).filter((x) => x.tipo === "execucao").first();
      if (ja) {
        if (ja.erro) await this.db.fila.update(ja.seq!, { erro: null });
        await this.marcarSalvo();
        await this.contar();
        this.agendar();
        return;
      }
    }
    await this.db.fila.add({ ...op, criada_em: new Date().toISOString(), tentativas: 0, erro: null });
    await this.marcarSalvo();
    await this.contar();
    this.agendar();
  }

  /** Espera um pouco antes de enviar (junta várias respostas seguidas num envio só). */
  agendar(ms = 1200) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.processar(); }, ms);
  }

  /** Envia a fila. true = tudo enviado. */
  processar(): Promise<boolean> {
    if (this.rodando) return this.rodando;
    this.rodando = this.processarAgora().finally(() => { this.rodando = null; });
    return this.rodando;
  }

  private async processarAgora(): Promise<boolean> {
    if (!this.estado.online) { await this.contar(); return false; }
    this.emitir({ enviando: true });
    try {
      for (;;) {
        const op = await this.db.fila.orderBy("seq").first();
        if (!op) break;
        try {
          await this.executar(op);
          await this.db.fila.delete(op.seq!);
          const agora = new Date().toISOString();
          await this.db.gravarMeta("enviadoEm", agora);
          this.emitir({ enviadoEm: agora, erro: null });
          await this.contar();
        } catch (e) {
          const err = e instanceof ErroServidor ? e : new ErroServidor((e as Error).message, /fetch|network/i.test((e as Error).message));
          if (err.semConexao) {
            this.emitir({ online: false });
          } else {
            await this.db.fila.update(op.seq!, { erro: err.message, tentativas: op.tentativas + 1 });
            this.emitir({ erro: err.message });
          }
          await this.contar();
          return false;
        }
      }
      await this.baixar().catch((e: unknown) => {
        if (e instanceof ErroServidor && e.semConexao) this.emitir({ online: false });
      });
      return true;
    } finally {
      this.emitir({ enviando: false });
    }
  }

  /** "Tentar de novo" (regra G). */
  async tentarDeNovo() {
    await this.db.fila.toCollection().modify({ erro: null });
    this.emitir({ erro: null, online: typeof navigator === "undefined" ? true : navigator.onLine !== false });
    return this.processar();
  }

  /** Descarta uma operação que o servidor recusou (não vale para execuções: os dados ficariam perdidos). */
  async descartar(seq: number) {
    const op = await this.db.fila.get(seq);
    if (!op || op.tipo === "execucao") return;
    await this.db.fila.delete(seq);
    this.emitir({ erro: null });
    await this.contar();
    await this.baixar().catch(() => undefined);
  }

  private async executar(op: Operacao) {
    const d = op.dados as Record<string, never>;
    switch (op.tipo) {
      case "execucao": return this.enviarExecucao(op.chave);
      case "plano_acao": return this.srv.acaoPlano(op.chave, d.acao, d.args ?? {});
      case "plano_criar": return this.srv.criarPlano(d.plano);
      case "plano_foto": {
        const f = await this.db.fotos.get(op.chave);
        if (!f) return;
        if (!f.enviada && f.blob) await this.srv.enviarArquivo(f.storage_path, f.blob, f.mime);
        await this.db.fotos.update(f.id, { enviada: true });
        return this.srv.registrarFotoPlano(semArquivo(f));
      }
      case "validar_execucao": return this.srv.validarExecucao(op.chave, d.aprovar, d.motivo);
      case "cancelar_tarefa": return this.srv.cancelarTarefa(op.chave, d.motivo);
      case "cancelar_execucao": return this.srv.cancelarExecucao(op.chave, d.motivo);
    }
  }

  private async enviarExecucao(id: string) {
    const ex = await this.db.execucoes.get(id);
    if (!ex) return;
    const fotos = await this.db.fotos.where("execucao_id").equals(id).toArray();
    // 1) arquivos (upload idempotente)
    for (const f of fotos) {
      if (f.enviada || !f.blob) continue;
      await this.srv.enviarArquivo(f.storage_path, f.blob, f.mime);
      await this.db.fotos.update(f.id, { enviada: true });
    }
    // 2) execução + respostas + fotos num pacote só (sync_execucao)
    const respostas = await this.db.respostas.where("execucao_id").equals(id).toArray();
    await this.srv.syncExecucao(semMarcas(ex as never), respostas, fotos.map(semArquivo));
    // 3) conclusão (o servidor confere as pendências de novo, pontua e cria os planos)
    if (ex.conclusao_pendente) {
      const assinatura = ex.assinatura_foto_id ? fotos.find((f) => f.id === ex.assinatura_foto_id)?.storage_path ?? null : null;
      const r = await this.srv.concluirExecucao(id, ex.fim_em ?? new Date().toISOString(), assinatura, ex.lat ?? null, ex.lng ?? null);
      await this.db.execucoes.update(id, { conclusao_pendente: false, pontuacao: r.pontuacao, assinatura_path: assinatura });
    }
  }

  /** Baixa o que mudou no servidor sem pisar no que ainda está na fila. */
  async baixar(dias = 7) {
    if (!this.lojas.length) return;
    const hoje = dataSP();
    const pac = await this.srv.baixar(this.lojas, somarDias(hoje, -dias), somarDias(hoje, 1));
    const fila = await this.db.fila.toArray();
    const pendentes = new Set(fila.map((o) => o.chave));
    await this.db.transaction("rw", [this.db.modelos, this.db.versoes, this.db.membros, this.db.agendamentos, this.db.tarefas, this.db.planos, this.db.execucoes], async () => {
      await this.db.modelos.clear();
      await this.db.modelos.bulkPut(pac.modelos);
      await this.db.versoes.bulkPut(pac.versoes);
      await this.db.membros.clear();
      await this.db.membros.bulkPut(pac.membros);
      await this.db.agendamentos.clear();
      await this.db.agendamentos.bulkPut(pac.agendamentos);
      for (const t of pac.tarefas) {
        const local = await this.db.tarefas.get(t.id);
        // tarefa concluída no aparelho e ainda não confirmada: mantém a marca local
        await this.db.tarefas.put(local?.concluida_em && !t.concluida_em && local.execucao_id && pendentes.has(local.execucao_id) ? { ...t, concluida_em: local.concluida_em, execucao_id: local.execucao_id } : t);
      }
      for (const p of pac.planos) if (!pendentes.has(p.id)) await this.db.planos.put(p);
      for (const e of pac.execucoes) {
        if (pendentes.has(e.id)) continue;
        const local = await this.db.execucoes.get(e.id);
        await this.db.execucoes.put({ ...local, ...e, conclusao_pendente: false });
      }
    });
    const agora = new Date().toISOString();
    await this.db.gravarMeta("baixadoEm", agora);
    this.emitir({ baixadoEm: agora });
  }
}
