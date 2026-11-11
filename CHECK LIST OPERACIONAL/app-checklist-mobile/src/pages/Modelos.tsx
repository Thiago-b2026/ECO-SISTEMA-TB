// Checklists da EMPRESA escolhida (gestor). Versão publicada NÃO muda (regra A):
// editar = rascunho → ajustar (editor completo) → pré-visualizar → publicar nova versão → agendar.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Archive, ArchiveRestore, CalendarPlus, Copy, Eye, FilePlus2, Lock, Pencil, Plus, Rocket, Save } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { servidor } from "../data/conexao";
import { PERFIS } from "../data/servidor";
import { SETORES } from "../data/seed-modelos";
import { validarConteudo } from "../domain/editor";
import { todosItens } from "../domain/regras";
import { dataHoraSP } from "../domain/tempo";
import type { Modelo, ModeloVersao, Perfil } from "../domain/tipos";
import { Aviso, Botao, Campo, Cartao, Carregando, Selo, Titulo, Vazio, classeEntrada, cx } from "../ui/base";
import { EditorChecklist } from "../ui/EditorChecklist";
import { PreviaChecklist } from "../ui/PreviaChecklist";

const CATEGORIAS: Record<string, string> = { diaria: "Diária", semanal: "Semanal", mensal: "Mensal", avaliacao: "Avaliação (nota)" };

export default function Modelos() {
  const { empresaAtual, maiorPerfil } = useApp();
  const { db, sinc } = useDados();
  const navigate = useNavigate();
  const rede = empresaAtual?.rede_id;
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const [sel, setSel] = useState<string>("");
  const [versoes, setVersoes] = useState<ModeloVersao[] | null>(null);
  const [rasc, setRasc] = useState<ModeloVersao | null>(null);
  const [modo, setModo] = useState<"editar" | "previa">("editar");
  const [sujo, setSujo] = useState(false);
  const [novo, setNovo] = useState(false);
  const [dados, setDados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [publicadoAgora, setPublicadoAgora] = useState(false);
  const setoresLocais = useLiveQuery(() => (rede ? db.setores.where("rede_id").equals(rede).toArray() : []), [rede]) ?? [];
  const setores = setoresLocais.length ? setoresLocais.filter((s) => s.ativo) : Object.entries(SETORES).map(([codigo, nome]) => ({ codigo, nome }));
  const nomeSetor = (s?: string) => (s ? setores.find((x) => x.codigo === s)?.nome ?? s : "Sem setor");

  async function carregarLista() {
    if (!rede) return;
    try { setModelos(await servidor.modelosDaEmpresa(rede)); } catch (e) { setErro(`${(e as Error).message} (a tela de checklists precisa de internet)`); }
  }
  async function carregar(id: string) {
    setVersoes(null); setRasc(null); setSujo(false);
    try {
      const vs = await servidor.versoesDoModelo(id);
      setVersoes(vs);
      setRasc(vs.find((v) => v.status === "rascunho") ?? null);
    } catch (e) { setErro((e as Error).message); }
  }
  useEffect(() => { setSel(""); setModelos(null); void carregarLista(); }, [rede]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPublicadoAgora(false); setModo("editar"); if (sel) void carregar(sel); }, [sel]);

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setErro(null); setOk(null); setOcupado(true);
    try { await fn(); await carregarLista(); if (sel) await carregar(sel); await sinc.baixar().catch(() => undefined); setOk(msg); return true; }
    catch (e) { setErro((e as Error).message); return false; } finally { setOcupado(false); }
  }

  if (!empresaAtual) return <Aviso tom="alerta">Escolha uma empresa.</Aviso>;
  if (maiorPerfil !== "gestor") return <Aviso tom="erro" titulo="Acesso negado">Só o gestor da empresa edita checklists.</Aviso>;
  if (!modelos) return erro ? <Aviso tom="erro">{erro}</Aviso> : <Carregando />;

  const modelo = modelos.find((m) => m.id === sel);
  const publicada = versoes?.find((v) => v.status === "publicada");
  const problemas = rasc ? validarConteudo(rasc.conteudo) : [];
  const lista = modelos.filter((m) => verArquivados || m.ativo);

  return (
    <div className="space-y-4">
      <Titulo acao={<Botao variante="secundario" onClick={() => setNovo((v) => !v)}><Plus className="size-5" aria-hidden /> Novo checklist</Botao>}>Cadastrar tarefas e checklists · {empresaAtual.nome}</Titulo>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {ok && <Aviso tom="ok">{ok}</Aviso>}

      {novo && (
        <DadosModelo titulo="Novo checklist (do zero)" ocupado={ocupado} onCancelar={() => setNovo(false)}
          onSalvar={async (d) => {
            let id = "";
            if (await acao(async () => { id = await servidor.criarModelo(empresaAtual.rede_id, d.nome, d.descricao, d.categoria, d.perfil); }, "Checklist criado em rascunho. Monte as seções e os itens.")) { setNovo(false); setSel(id); }
          }} />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-sm font-semibold">Checklist</span>
          <select className={classeEntrada} value={sel} onChange={(e) => { if (sujo && !confirm("Há mudanças no rascunho que não foram salvas. Sair mesmo assim?")) return; setSel(e.target.value); }}>
            <option value="">Escolha… ({lista.length})</option>
            {lista.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.ativo ? "" : " (arquivado)"}</option>)}
          </select>
        </label>
        <label className="flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={verArquivados} onChange={(e) => setVerArquivados(e.target.checked)} /> Mostrar arquivados</label>
      </div>
      {modelos.length === 0 && !novo && <Vazio>Esta empresa ainda não tem checklists. Crie um do zero, ou peça ao admin para copiar de outra empresa.</Vazio>}

      {modelo && (
        <Cartao className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-lg font-bold">{modelo.nome}</h2>
            {!modelo.ativo && <Selo tom="neutro" icone={Archive}>Arquivado</Selo>}
            <Selo tom="neutro">{CATEGORIAS[modelo.categoria] ?? modelo.categoria}</Selo>
            <Selo tom="neutro">Executa: {PERFIS[modelo.perfil_executor]}</Selo>
          </div>
          {modelo.descricao && <p className="text-sm text-gray-700">{modelo.descricao}</p>}
          <div className="flex flex-wrap gap-2">
            <Botao variante="fantasma" onClick={() => setDados((v) => !v)}><Pencil className="size-5" aria-hidden /> Nome e dados</Botao>
            <Botao variante="fantasma" carregando={ocupado} onClick={async () => { let id = ""; if (await acao(async () => { id = await servidor.duplicarModelo(modelo.id); }, "Cópia criada em rascunho.")) setSel(id); }}>
              <Copy className="size-5" aria-hidden /> Duplicar checklist
            </Botao>
            <Botao variante="fantasma" carregando={ocupado} onClick={() => { if (!modelo.ativo || confirm(`Arquivar "${modelo.nome}"? Ele some das listas e os agendamentos dele param. Nada é apagado.`)) void acao(() => servidor.arquivarModelo(modelo.id, modelo.ativo), modelo.ativo ? "Checklist arquivado." : "Checklist reativado."); }}>
              {modelo.ativo ? <><Archive className="size-5" aria-hidden /> Arquivar</> : <><ArchiveRestore className="size-5" aria-hidden /> Reativar</>}
            </Botao>
          </div>
          {dados && (
            <DadosModelo titulo="Nome e dados" inicial={modelo} ocupado={ocupado} onCancelar={() => setDados(false)}
              onSalvar={async (d) => { if (await acao(() => servidor.editarModelo(modelo.id, d.nome, d.descricao, d.categoria, d.perfil), "Dados salvos.")) setDados(false); }} />
          )}
          {!versoes ? <Carregando /> : (
            <>
              <h3 className="pt-2 font-semibold">Versões</h3>
              <ul className="space-y-1 text-sm">
                {versoes.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2">
                    <b>Versão {v.numero}</b>
                    {v.status === "publicada" ? <Selo tom="ok" icone={Lock}>Publicada (não muda mais)</Selo> : v.status === "arquivada" ? <Selo tom="neutro" icone={Lock}>Arquivada</Selo> : <Selo tom="alerta" icone={Pencil}>Rascunho</Selo>}
                    {v.publicada_em && <span className="text-gray-600">em {dataHoraSP(v.publicada_em)}</span>}
                    <span className="text-gray-600">· {todosItens(v.conteudo).length} itens</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-600">Execuções antigas continuam ligadas à versão em que foram feitas.</p>
              {!rasc && modelo.ativo && (
                <Botao variante="secundario" carregando={ocupado} onClick={() => acao(() => servidor.criarRascunho(modelo.id), "Rascunho criado a partir da última versão.")}>
                  <FilePlus2 className="size-5" aria-hidden /> Criar rascunho para editar
                </Botao>
              )}
              {publicadoAgora && publicada && (
                <Aviso tom="ok" titulo={`Versão ${publicada.numero} publicada`} acao={<Botao onClick={() => navigate(`/agendamentos?modelo=${modelo.id}`)}><CalendarPlus className="size-5" aria-hidden /> Criar agendamento</Botao>}>
                  Agende para as unidades e as tarefas passam a aparecer.
                </Aviso>
              )}
            </>
          )}
        </Cartao>
      )}

      {rasc && modelo && (
        <>
          <Aviso tom="alerta" titulo={`Editando o rascunho da versão ${rasc.numero}`}>Nada muda para quem executa até você publicar.{sujo ? " Há mudanças não salvas." : ""}</Aviso>
          <div role="tablist" aria-label="Rascunho" className="flex gap-2">
            {(["editar", "previa"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={modo === m} onClick={() => setModo(m)}
                className={cx("inline-flex min-h-11 items-center gap-1 rounded-full border-2 px-4 text-sm font-semibold", modo === m ? "border-marca bg-marca text-white" : "border-gray-300 bg-white")}>
                {m === "editar" ? <><Pencil className="size-4" aria-hidden /> Editar</> : <><Eye className="size-4" aria-hidden /> Pré-visualizar</>}
              </button>
            ))}
          </div>
          {modo === "editar"
            ? <EditorChecklist conteudo={rasc.conteudo} setores={setores} onChange={(c) => { setRasc({ ...rasc, conteudo: c }); setSujo(true); }} />
            : <PreviaChecklist conteudo={rasc.conteudo} nomeSetor={nomeSetor} />}
          {problemas.length > 0 && (
            <Aviso tom="alerta" titulo="Corrija antes de publicar">
              <ul className="ml-4 list-disc">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>
            </Aviso>
          )}
          <div className="sticky bottom-16 z-10 flex flex-wrap gap-2 rounded-xl border bg-white p-3 shadow lg:bottom-2">
            <Botao variante="secundario" carregando={ocupado} disabled={!sujo} onClick={async () => { if (await acao(() => servidor.salvarRascunho(rasc), "Rascunho salvo.")) setSujo(false); }}>
              <Save className="size-5" aria-hidden /> Salvar rascunho
            </Botao>
            <Botao carregando={ocupado} disabled={problemas.length > 0}
              onClick={() => { if (confirm(`Publicar a versão ${rasc.numero}? Ela não poderá mais ser alterada.`)) void acao(async () => { await servidor.salvarRascunho(rasc); await servidor.publicarVersao(rasc.id); setSujo(false); setPublicadoAgora(true); }, `Versão ${rasc.numero} publicada.`); }}>
              <Rocket className="size-5" aria-hidden /> Publicar versão {rasc.numero}
            </Botao>
          </div>
        </>
      )}
      {!rasc && publicada && <PreviaLeitura v={publicada} nomeSetor={nomeSetor} />}
    </div>
  );
}

function DadosModelo({ titulo, inicial, ocupado, onSalvar, onCancelar }: {
  titulo: string; inicial?: Modelo; ocupado: boolean; onCancelar: () => void;
  onSalvar: (d: { nome: string; descricao: string | null; categoria: string; perfil: Perfil }) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [categoria, setCategoria] = useState(inicial?.categoria ?? "diaria");
  const [perfil, setPerfil] = useState<Perfil>(inicial?.perfil_executor ?? "operador");
  return (
    <Cartao className="space-y-3 bg-gray-50">
      <h3 className="font-semibold">{titulo}</h3>
      <Campo rotulo="Nome"><input className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
      <Campo rotulo="Descrição"><textarea className={cx(classeEntrada, "min-h-16 py-2")} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Quem executa">
          <select className={classeEntrada} value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
            {(Object.keys(PERFIS) as Perfil[]).map((p) => <option key={p} value={p}>{PERFIS[p]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Frequência sugerida">
          <select className={classeEntrada} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
      </div>
      <div className="flex gap-2">
        <Botao carregando={ocupado} disabled={!nome.trim()} onClick={() => onSalvar({ nome, descricao: descricao.trim() || null, categoria, perfil })}>Salvar</Botao>
        <Botao variante="fantasma" onClick={onCancelar}>Cancelar</Botao>
      </div>
    </Cartao>
  );
}

function PreviaLeitura({ v, nomeSetor }: { v: ModeloVersao; nomeSetor: (s?: string) => string }) {
  return (
    <Cartao>
      <h2 className="mb-2 font-semibold">Versão {v.numero} (publicada) – como o operador vê</h2>
      <PreviaChecklist conteudo={v.conteudo} nomeSetor={nomeSetor} />
    </Cartao>
  );
}
