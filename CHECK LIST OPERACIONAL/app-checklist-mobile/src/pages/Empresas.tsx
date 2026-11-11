// Empresas e lojas (SÓ O ADMIN). Usa a estrutura do Ecossistema: public.redes (empresa) → public.lojas
// (matriz e filiais; CNPJ com final /0001 = matriz). "Usa o Check List" = 'checklist' em lojas.sistemas.
// Nada é apagado: empresa e unidade são inativadas.
import { useEffect, useState } from "react";
import { Building2, Check, Copy, Pencil, Plus, Power, Store } from "lucide-react";
import { useApp } from "../app/contexto";
import { servidor } from "../data/conexao";
import type { EmpresaCompleta, Unidade } from "../data/servidor";
import type { Modelo } from "../domain/tipos";
import { cnpjValido, formatarCnpj, soDigitos, tipoPeloCnpj } from "../lib/cnpj";
import { Aviso, Botao, Campo, Cartao, Carregando, Selo, Titulo, Vazio, classeEntrada, cx } from "../ui/base";

const ordemUnidade = (a: Unidade, b: Unidade) => (a.tipo === "matriz" ? 0 : 1) - (b.tipo === "matriz" ? 0 : 1) || a.nome.localeCompare(b.nome);

export default function Empresas() {
  const { admin, recarregar, setEmpresa } = useApp();
  const [lista, setLista] = useState<EmpresaCompleta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nova, setNova] = useState(false);
  const [unidadeEm, setUnidadeEm] = useState<{ rede: string; u?: Unidade } | null>(null);

  async function carregar() {
    try { setLista(await servidor.empresas()); } catch (e) { setErro(`${(e as Error).message} (esta tela precisa de internet)`); }
  }
  useEffect(() => { if (admin) void carregar(); }, [admin]);

  async function fazer(fn: () => Promise<unknown>, msg: string) {
    setErro(null); setOk(null); setOcupado(true);
    try { await fn(); await carregar(); await recarregar(); setOk(msg); return true; } catch (e) { setErro((e as Error).message); return false; } finally { setOcupado(false); }
  }

  if (!admin) return <Aviso tom="erro" titulo="Acesso negado">Só o admin do Ecossistema cadastra empresas e lojas.</Aviso>;

  return (
    <div className="space-y-4">
      <Titulo acao={<Botao variante="secundario" onClick={() => setNova((v) => !v)}><Plus className="size-5" aria-hidden /> Nova empresa</Botao>}>Empresas e lojas</Titulo>
      <Aviso tom="info">Mesmo cadastro do Ecossistema TB (Portal): empresa → matriz → filiais. Marque “usa o Check List” nas unidades que vão usar este sistema.</Aviso>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {ok && <Aviso tom="ok">{ok}</Aviso>}
      {nova && lista && (
        <NovaEmpresa empresas={lista} ocupado={ocupado} onCancelar={() => setNova(false)}
          onCriar={async (nome, copiarDe, modelos) => {
            let id = "";
            const feito = await fazer(async () => {
              id = await servidor.criarEmpresa(nome);
              if (copiarDe) await servidor.copiarModelos(copiarDe, id, modelos);
            }, copiarDe ? `Empresa criada com ${modelos?.length ?? "todos os"} checklist(s) copiado(s) em rascunho. Revise e publique em Modelos.` : "Empresa criada. Agora cadastre a matriz e as filiais.");
            if (feito) { setNova(false); setUnidadeEm({ rede: id }); }
          }} />
      )}
      {unidadeEm && (
        <FormUnidade key={unidadeEm.u?.id ?? unidadeEm.rede} rede={unidadeEm.rede} u={unidadeEm.u} ocupado={ocupado} onCancelar={() => setUnidadeEm(null)}
          onSalvar={async (dados) => { if (await fazer(() => servidor.salvarUnidade(dados), dados.id ? "Unidade salva." : "Unidade cadastrada.")) setUnidadeEm(null); }} />
      )}
      {!lista ? !erro && <Carregando /> : lista.length === 0 ? <Vazio>Nenhuma empresa cadastrada.</Vazio> : (
        <ul className="space-y-3">
          {lista.map((e) => {
            const us = [...e.unidades].sort(ordemUnidade);
            return (
              <li key={e.id}>
                <Cartao className={cx(!e.ativo && "opacity-70")}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Building2 className="size-5 text-marca" aria-hidden />
                    <h2 className="flex-1 text-lg font-bold">{e.nome}</h2>
                    <Selo tom="neutro">{us.filter((u) => u.sistemas.includes("checklist") && u.ativo).length} usando o Check List</Selo>
                    <Botao variante="fantasma" onClick={() => setEmpresa(e.id)}>Abrir no app</Botao>
                    <Botao variante="secundario" onClick={() => setUnidadeEm({ rede: e.id })}><Plus className="size-5" aria-hidden /> Unidade</Botao>
                  </div>
                  {us.length === 0 ? <p className="text-sm text-gray-600">Sem unidades. Cadastre a matriz (CNPJ com final /0001).</p> : (
                    <ul className="divide-y">
                      {us.map((u) => {
                        const usa = u.sistemas.includes("checklist");
                        return (
                          <li key={u.id} className={cx("flex flex-wrap items-center gap-2 py-2", u.tipo !== "matriz" && "pl-4 sm:pl-8")}>
                            <Store className="size-4 text-gray-500" aria-hidden />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold">{u.nome}</div>
                              <div className="text-xs text-gray-600">{u.tipo === "matriz" ? "Matriz" : u.tipo === "filial" ? "Filial" : "Sem CNPJ"}{u.cnpj ? ` · ${formatarCnpj(u.cnpj)}` : ""}{u.sistemas.filter((s) => s !== "checklist").length ? ` · também em: ${u.sistemas.filter((s) => s !== "checklist").join(", ")}` : ""}</div>
                            </div>
                            {!u.ativo && <Selo tom="neutro" icone={Power}>Inativa</Selo>}
                            <button role="switch" aria-checked={usa} disabled={ocupado}
                              onClick={() => fazer(() => servidor.salvarUnidade({ id: u.id, rede_id: e.id, nome: u.nome, cnpj: u.cnpj, ativo: u.ativo, usaChecklist: !usa }), `${u.nome}: ${usa ? "não usa mais" : "agora usa"} o Check List.`)}
                              className={cx("inline-flex min-h-11 items-center gap-1 rounded-full border-2 px-3 text-sm font-semibold", usa ? "border-marca bg-marca-claro text-marca" : "border-gray-300 bg-white text-gray-700")}>
                              {usa ? <Check className="size-4" aria-hidden /> : <span className="size-4 rounded border-2 border-gray-400" aria-hidden />} Usa o Check List
                            </button>
                            <Botao variante="fantasma" onClick={() => setUnidadeEm({ rede: e.id, u })} aria-label={`Editar ${u.nome}`}><Pencil className="size-5" aria-hidden /></Botao>
                            <Botao variante="fantasma" disabled={ocupado}
                              onClick={() => { if (u.ativo && !confirm(`Inativar ${u.nome}? Nada é apagado; ela some das listas.`)) return; void fazer(() => servidor.salvarUnidade({ id: u.id, rede_id: e.id, nome: u.nome, cnpj: u.cnpj, ativo: !u.ativo, usaChecklist: usa }), `${u.nome} ${u.ativo ? "inativada" : "reativada"}.`); }}>
                              <Power className="size-5" aria-hidden /> {u.ativo ? "Inativar" : "Reativar"}
                            </Botao>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NovaEmpresa({ empresas, ocupado, onCriar, onCancelar }: {
  empresas: EmpresaCompleta[]; ocupado: boolean; onCancelar: () => void;
  onCriar: (nome: string, copiarDe: string | null, modelos: string[] | null) => void;
}) {
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState<"zero" | "copiar">("zero");
  const [de, setDe] = useState(empresas[0]?.id ?? "");
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (inicio !== "copiar" || !de) return;
    setModelos(null);
    servidor.modelosDaEmpresa(de).then((ms) => { const ativos = ms.filter((m) => m.ativo); setModelos(ativos); setMarcados(new Set(ativos.map((m) => m.id))); }).catch(() => setModelos([]));
  }, [inicio, de]);
  return (
    <Cartao className="space-y-3">
      <h2 className="font-semibold">Nova empresa</h2>
      <Campo rotulo="Nome da empresa"><input className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: SUPERMERCADO EXEMPLO" /></Campo>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Checklists</legend>
        {(["zero", "copiar"] as const).map((x) => (
          <label key={x} className="flex min-h-11 items-center gap-2">
            <input type="radio" name="inicio" className="size-5" checked={inicio === x} onChange={() => setInicio(x)} />
            {x === "zero" ? "Começar do zero" : "Copiar checklists de outra empresa"}
          </label>
        ))}
      </fieldset>
      {inicio === "copiar" && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-3">
          <Campo rotulo="Copiar de">
            <select className={classeEntrada} value={de} onChange={(e) => setDe(e.target.value)}>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </Campo>
          {!modelos ? <Carregando /> : modelos.length === 0 ? <p className="text-sm">Essa empresa não tem checklists.</p> : (
            <>
              <p className="text-sm text-gray-700">As cópias são independentes: entram em <b>rascunho (versão 1)</b> para revisar e publicar. Mudar a cópia nunca altera a original.</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {modelos.map((m) => (
                  <li key={m.id}>
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" className="size-5" checked={marcados.has(m.id)}
                        onChange={() => setMarcados((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} />
                      {m.nome}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Botao carregando={ocupado} disabled={!nome.trim() || (inicio === "copiar" && !marcados.size)}
          onClick={() => onCriar(nome, inicio === "copiar" ? de : null, inicio === "copiar" ? [...marcados] : null)}>
          {inicio === "copiar" ? <><Copy className="size-5" aria-hidden /> Criar e copiar {marcados.size}</> : <><Plus className="size-5" aria-hidden /> Criar empresa</>}
        </Botao>
        <Botao variante="fantasma" onClick={onCancelar}>Cancelar</Botao>
      </div>
    </Cartao>
  );
}

function FormUnidade({ rede, u, ocupado, onSalvar, onCancelar }: {
  rede: string; u?: Unidade; ocupado: boolean; onCancelar: () => void;
  onSalvar: (d: { id?: string; rede_id: string; nome: string; cnpj: string | null; ativo: boolean; usaChecklist: boolean }) => void;
}) {
  const [nome, setNome] = useState(u?.nome ?? "");
  const [cnpj, setCnpj] = useState(formatarCnpj(u?.cnpj));
  const [usa, setUsa] = useState(u ? u.sistemas.includes("checklist") : true);
  const d = soDigitos(cnpj);
  const erroCnpj = d && !cnpjValido(d) ? "CNPJ inválido (confira os dígitos)." : null;
  const tipo = tipoPeloCnpj(d);
  return (
    <Cartao className="space-y-3">
      <h2 className="font-semibold">{u ? `Editar ${u.nome}` : "Nova unidade"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome da unidade"><input className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Loja Centro" /></Campo>
        <Campo rotulo="CNPJ" ajuda={erroCnpj ?? (tipo ? `Tipo: ${tipo === "matriz" ? "matriz (/0001)" : "filial"}` : "O tipo sai do CNPJ: final /0001 = matriz; outro final = filial.")}>
          <input inputMode="numeric" className={classeEntrada} value={cnpj} onChange={(e) => setCnpj(formatarCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
        </Campo>
      </div>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={usa} onChange={(e) => setUsa(e.target.checked)} /> Usa o Check List</label>
      <div className="flex flex-wrap gap-2">
        <Botao carregando={ocupado} disabled={!nome.trim() || !!erroCnpj} onClick={() => onSalvar({ id: u?.id, rede_id: rede, nome, cnpj: d || null, ativo: u?.ativo ?? true, usaChecklist: usa })}>Salvar</Botao>
        <Botao variante="fantasma" onClick={onCancelar}>Cancelar</Botao>
      </div>
    </Cartao>
  );
}
