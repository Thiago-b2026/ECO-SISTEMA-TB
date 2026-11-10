// Agendamento e atribuição: qual checklist, em que unidade, com que frequência, até que horas e para quem.
// Gravar precisa de internet (é cadastro); as tarefas do dia saem daqui (checklist.gerar_tarefas).
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarPlus, Pencil, Power, Wand2 } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { servidor } from "../data/conexao";
import { MODELOS_SEED } from "../data/seed-modelos";
import { PERFIS } from "../data/servidor";
import { descreverAgenda } from "../domain/agenda";
import { novoId } from "../domain/ids";
import { NOMES_DIA, dataSP } from "../domain/tempo";
import type { Agendamento, Frequencia, Perfil } from "../domain/tipos";
import { Aviso, Botao, Campo, Cartao, Carregando, Selo, Titulo, Vazio, classeEntrada, cx } from "../ui/base";

const vazio = (loja: string): Agendamento => ({
  id: novoId(), modelo_id: "", loja_id: loja, responsavel_id: null, perfil_responsavel: "operador", frequencia: "diaria",
  dias_semana: [], dia_mes: null, dias_antes_fim_mes: null, hora_inicio: "07:00", hora_limite: "18:00", ativo: true,
});

export default function Agendamentos() {
  const { lojaAtual } = useApp();
  const { db, sinc } = useDados();
  const [edit, setEdit] = useState<Agendamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const loja = lojaAtual?.loja_id;

  const d = useLiveQuery(async () => {
    if (!loja) return null;
    return {
      ags: await db.agendamentos.where("loja_id").equals(loja).toArray(),
      modelos: (await db.modelos.toArray()).sort((a, b) => a.nome.localeCompare(b.nome)),
      membros: (await db.membros.where("loja_id").equals(loja).toArray()).filter((m) => m.ativo),
    };
  }, [loja]);

  if (!lojaAtual) return <Vazio>Você ainda não está na equipe de nenhuma unidade.</Vazio>;
  if (!d) return <Carregando />;
  const nomeModelo = (id: string) => d.modelos.find((m) => m.id === id)?.nome ?? "?";
  const quem = (a: Agendamento) => a.responsavel_id ? d.membros.find((m) => m.usuario_id === a.responsavel_id)?.nome ?? "—" : `Qualquer ${PERFIS[a.perfil_responsavel ?? "operador"].toLowerCase()}`;

  async function salvar(a: Agendamento) {
    setErro(null); setOk(null); setOcupado(true);
    try {
      await servidor.salvarAgendamento(a);
      await servidor.gerarTarefas(dataSP()).catch(() => undefined);
      await sinc.baixar();
      setEdit(null);
      setOk("Agendamento salvo.");
    } catch (e) {
      setErro(`Não foi salvo: ${(e as Error).message}${sinc.estado.online ? "" : " (sem internet: cadastros precisam de conexão)"}`);
    } finally { setOcupado(false); }
  }

  async function sugerida() {
    setErro(null); setOk(null); setOcupado(true);
    let n = 0;
    try {
      for (const s of MODELOS_SEED) {
        const m = d!.modelos.find((x) => x.codigo === s.codigo);
        if (!m || d!.ags.some((a) => a.modelo_id === m.id)) continue;
        await servidor.salvarAgendamento({
          ...vazio(lojaAtual!.loja_id), modelo_id: m.id, perfil_responsavel: s.perfil_executor, frequencia: s.agenda.frequencia,
          dias_semana: s.agenda.dias_semana ?? null, dia_mes: s.agenda.dia_mes ?? null, dias_antes_fim_mes: s.agenda.dias_antes_fim_mes ?? null,
          hora_inicio: s.agenda.hora_inicio, hora_limite: s.agenda.hora_limite,
        });
        n++;
      }
      await servidor.gerarTarefas(dataSP()).catch(() => undefined);
      await sinc.baixar();
      setOk(n ? `${n} agendamento(s) criado(s) com a agenda da planilha.` : "Todos os modelos já têm agendamento nesta unidade.");
    } catch (e) {
      setErro(`Parou depois de ${n}: ${(e as Error).message}`);
    } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-4">
      <Titulo acao={<Botao variante="secundario" onClick={() => setEdit(vazio(lojaAtual.loja_id))}><CalendarPlus className="size-5" aria-hidden /> Novo</Botao>}>Agendamentos · {lojaAtual.nome}</Titulo>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {ok && <Aviso tom="ok">{ok}</Aviso>}
      {edit && <Formulario a={edit} modelos={d.modelos} membros={d.membros} ocupado={ocupado} onSalvar={salvar} onCancelar={() => setEdit(null)} />}
      {d.ags.length === 0 && !edit && (
        <Cartao className="space-y-2">
          <p>Nenhum checklist agendado nesta unidade.</p>
          <Botao onClick={sugerida} carregando={ocupado}><Wand2 className="size-5" aria-hidden /> Aplicar a agenda sugerida (da planilha)</Botao>
        </Cartao>
      )}
      <ul className="space-y-2">
        {d.ags.sort((a, b) => nomeModelo(a.modelo_id).localeCompare(nomeModelo(b.modelo_id))).map((a) => (
          <li key={a.id}>
            <Cartao className={cx("flex flex-wrap items-center gap-3", !a.ativo && "opacity-70")}>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{nomeModelo(a.modelo_id)}</div>
                <div className="text-sm text-gray-700">{descreverAgenda(a)} · {quem(a)}</div>
                {!a.ativo && <Selo tom="neutro" icone={Power}>Desativado</Selo>}
              </div>
              <Botao variante="fantasma" onClick={() => setEdit({ ...a })}><Pencil className="size-5" aria-hidden /> Editar</Botao>
              <Botao variante="fantasma" carregando={ocupado} onClick={() => salvar({ ...a, ativo: !a.ativo })}><Power className="size-5" aria-hidden /> {a.ativo ? "Desativar" : "Ativar"}</Botao>
            </Cartao>
          </li>
        ))}
      </ul>
      {d.ags.length > 0 && <Botao variante="fantasma" onClick={sugerida} carregando={ocupado}><Wand2 className="size-5" aria-hidden /> Agendar os modelos que faltam (agenda sugerida)</Botao>}
    </div>
  );
}

function Formulario({ a: inicial, modelos, membros, ocupado, onSalvar, onCancelar }: {
  a: Agendamento; modelos: { id: string; nome: string }[]; membros: { usuario_id: string; nome: string; perfil: Perfil }[];
  ocupado: boolean; onSalvar: (a: Agendamento) => void; onCancelar: () => void;
}) {
  const [a, setA] = useState(inicial);
  const [mensal, setMensal] = useState<"dia" | "fim">(inicial.dias_antes_fim_mes != null ? "fim" : "dia");
  const set = (p: Partial<Agendamento>) => setA((x) => ({ ...x, ...p }));
  const dias = a.dias_semana ?? [];
  function confirmar() {
    onSalvar({
      ...a,
      dias_semana: a.frequencia === "semanal" ? dias : null,
      dia_mes: a.frequencia === "mensal" && mensal === "dia" ? a.dia_mes ?? 1 : null,
      dias_antes_fim_mes: a.frequencia === "mensal" && mensal === "fim" ? a.dias_antes_fim_mes ?? 0 : null,
    });
  }
  return (
    <Cartao className="space-y-3">
      <Campo rotulo="Checklist">
        <select className={classeEntrada} value={a.modelo_id} onChange={(e) => set({ modelo_id: e.target.value })}>
          <option value="">Escolha…</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Responsável" ajuda="Uma pessoa, ou qualquer pessoa do perfil.">
          <select className={classeEntrada} value={a.responsavel_id ?? `perfil:${a.perfil_responsavel}`} onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("perfil:")) set({ responsavel_id: null, perfil_responsavel: v.slice(7) as Perfil });
            else set({ responsavel_id: v, perfil_responsavel: membros.find((m) => m.usuario_id === v)?.perfil ?? null });
          }}>
            {(["operador", "supervisor", "gestor"] as Perfil[]).map((p) => <option key={p} value={`perfil:${p}`}>Qualquer {PERFIS[p].toLowerCase()}</option>)}
            {membros.map((m) => <option key={m.usuario_id} value={m.usuario_id}>{m.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Frequência">
          <select className={classeEntrada} value={a.frequencia} onChange={(e) => set({ frequencia: e.target.value as Frequencia })}>
            <option value="diaria">Todo dia</option>
            <option value="semanal">Semanal (escolha os dias)</option>
            <option value="mensal">Mensal</option>
          </select>
        </Campo>
      </div>
      {a.frequencia === "semanal" && (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Dias da semana</legend>
          <div className="flex flex-wrap gap-2">
            {NOMES_DIA.map((n, i) => (
              <button key={n} type="button" role="checkbox" aria-checked={dias.includes(i)} onClick={() => set({ dias_semana: dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i].sort() })}
                className={cx("min-h-11 rounded-lg border-2 px-3 text-sm font-semibold", dias.includes(i) ? "border-marca bg-marca text-white" : "border-gray-300 bg-white")}>
                {dias.includes(i) ? "✓ " : ""}{n}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {a.frequencia === "mensal" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Regra do mês">
            <select className={classeEntrada} value={mensal} onChange={(e) => setMensal(e.target.value as "dia" | "fim")}>
              <option value="dia">Num dia fixo</option>
              <option value="fim">N dias antes do fim do mês</option>
            </select>
          </Campo>
          {mensal === "dia" ? (
            <Campo rotulo="Dia do mês" ajuda="Se o mês for mais curto, vale o último dia."><input type="number" min={1} max={31} className={classeEntrada} value={a.dia_mes ?? 1} onChange={(e) => set({ dia_mes: Number(e.target.value) })} /></Campo>
          ) : (
            <Campo rotulo="Dias antes do fim" ajuda="Ex.: 8 = faltando 8 dias para encerrar o mês."><input type="number" min={0} max={27} className={classeEntrada} value={a.dias_antes_fim_mes ?? 8} onChange={(e) => set({ dias_antes_fim_mes: Number(e.target.value) })} /></Campo>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Começa às"><input type="time" className={classeEntrada} value={a.hora_inicio.slice(0, 5)} onChange={(e) => set({ hora_inicio: e.target.value })} /></Campo>
        <Campo rotulo="Prazo (horário-limite)"><input type="time" className={classeEntrada} value={a.hora_limite.slice(0, 5)} onChange={(e) => set({ hora_limite: e.target.value })} /></Campo>
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao disabled={!a.modelo_id} carregando={ocupado} onClick={confirmar}>Salvar</Botao>
        <Botao variante="fantasma" onClick={onCancelar}>Cancelar</Botao>
      </div>
    </Cartao>
  );
}
