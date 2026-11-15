// Empresas e lojas (SÓ o admin). É o cadastro ÚNICO do ecossistema (public.redes e public.lojas): o mesmo que
// o Portal, o PDV e o Check List usam. Aqui o admin cria a empresa, as unidades (matriz e filiais pelo CNPJ) e
// marca quais usam o Meta de Vendas.
import { Building2, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useApp, useDados } from "../app/contexto";
import { servidor } from "../data/conexao";
import type { Empresa, UnidadeCadastro } from "../data/servidor";
import { formatarCnpj, soDigitos, tipoPeloCnpj } from "../lib/cnpj";
import { dadosVazios, enderecoCurto, FormUnidade, type FormUnidadeValor } from "../ui/FormUnidade";
import { Aviso, Botao, Campo, Carregando, Cartao, classeEntrada, Selo, Titulo, Vazio } from "../ui/base";

const NOMES_SISTEMAS: Record<string, string> = { pdv: "PDV", rh: "RH", checklist: "Check List", pop: "POP", precificacao: "Precificação", crm: "CRM" };

export default function Empresas() {
  const { recarregarAcesso } = useApp();
  const lista = useDados(() => servidor.empresas(), []);
  const [novaEmpresa, setNovaEmpresa] = useState("");
  const [empresaEdit, setEmpresaEdit] = useState<{ id: string; nome: string; ativo: boolean } | null>(null);
  const [unidade, setUnidade] = useState<FormUnidadeValor | null>(null);
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function rodar(fn: () => Promise<unknown>, ok: string, depois?: () => void) {
    setOcupado(true);
    setMsg(null);
    try {
      await fn();
      depois?.();
      setMsg({ tom: "ok", texto: ok });
      await recarregarAcesso();
    } catch (x) {
      setMsg({ tom: "erro", texto: (x as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  function criarEmpresa(e: FormEvent) {
    e.preventDefault();
    if (!novaEmpresa.trim()) return;
    void rodar(() => servidor.salvarEmpresa({ nome: novaEmpresa, ativo: true }), `Empresa ${novaEmpresa.trim().toUpperCase()} cadastrada. Agora inclua as lojas dela.`, () => setNovaEmpresa(""));
  }

  if (lista.erro) return <Aviso tom="erro">{lista.erro}</Aviso>;
  if (lista.carregando || !lista.dados) return <Carregando />;

  const formUnidade = (u: FormUnidadeValor) => (
    <FormUnidade valor={u} mudar={setUnidade} cancelar={() => setUnidade(null)} ocupado={ocupado}
      salvar={(v) => void rodar(() => servidor.salvarUnidade({ ...v, cnpj: soDigitos(v.cnpj) || null }), v.id ? "Unidade salva." : `Unidade ${v.nome.trim()} cadastrada.`, () => setUnidade(null))} />
  );

  const linhaUnidade = (u: UnidadeCadastro) => (
    <li key={u.id} className="border-t border-gray-100 py-2">
      {unidade?.id === u.id ? formUnidade(unidade) : (
        <div className="flex flex-wrap items-center gap-2">
          <Store className="size-4 text-gray-600" aria-hidden />
          <span className="min-w-40 flex-1">
            <span className="font-semibold">{u.nome}</span>
            {enderecoCurto(u.dados) ? <span className="block text-xs text-gray-700">{enderecoCurto(u.dados)}</span> : <span className="block text-xs text-amber-800">Endereço não cadastrado</span>}
          </span>
          {u.cnpj ? <span className="text-sm text-gray-700">{formatarCnpj(u.cnpj)} · {tipoPeloCnpj(u.cnpj)}</span> : <Selo tom="alerta">Sem CNPJ</Selo>}
          {u.usaMetas ? <Selo tom="ok">Usa o Meta de Vendas</Selo> : <Selo tom="neutro">Não usa o Meta de Vendas</Selo>}
          {!u.ativo && <Selo tom="alerta">Inativa</Selo>}
          {u.outros.length > 0 && <span className="text-xs text-gray-600">Também em: {u.outros.map((s) => NOMES_SISTEMAS[s] ?? s).join(", ")}</span>}
          <Botao variante="fantasma" aria-label={`Editar ${u.nome}`}
            onClick={() => setUnidade({ id: u.id, rede_id: u.rede_id ?? "", nome: u.nome, cnpj: formatarCnpj(u.cnpj), ativo: u.ativo, usaMetas: u.usaMetas, dados: dadosVazios(u.dados) })}>
            <Pencil className="size-4" aria-hidden /> Editar
          </Botao>
          <Botao variante="fantasma" className="text-red-800" aria-label={`Excluir ${u.nome}`} carregando={ocupado}
            onClick={() => window.confirm(`Excluir a unidade ${u.nome}? Só é possível se ela nunca foi usada.`) && void rodar(() => servidor.excluirUnidade(u.id), `Unidade ${u.nome} excluída.`)}>
            <Trash2 className="size-4" aria-hidden /> Excluir
          </Botao>
        </div>
      )}
    </li>
  );

  const cartaoEmpresa = (emp: Empresa) => (
    <Cartao key={emp.id}>
      {empresaEdit?.id === emp.id ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void rodar(() => servidor.salvarEmpresa(empresaEdit), "Empresa salva.", () => setEmpresaEdit(null)); }}>
          <div className="min-w-56 flex-1"><Campo rotulo="Nome da empresa"><input className={classeEntrada} value={empresaEdit.nome} onChange={(e) => setEmpresaEdit({ ...empresaEdit, nome: e.target.value })} /></Campo></div>
          <label className="flex min-h-12 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={empresaEdit.ativo} onChange={(e) => setEmpresaEdit({ ...empresaEdit, ativo: e.target.checked })} /> Ativa
          </label>
          <Botao type="submit" carregando={ocupado}>Salvar</Botao>
          <Botao type="button" variante="secundario" onClick={() => setEmpresaEdit(null)}>Cancelar</Botao>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="size-5 text-marca" aria-hidden />
          <h2 className="flex-1 text-lg font-bold">{emp.nome}</h2>
          {!emp.ativo && <Selo tom="alerta">Inativa</Selo>}
          <Botao variante="fantasma" aria-label={`Editar empresa ${emp.nome}`} onClick={() => setEmpresaEdit({ id: emp.id, nome: emp.nome, ativo: emp.ativo })}>
            <Pencil className="size-4" aria-hidden /> Editar
          </Botao>
          <Botao variante="fantasma" className="text-red-800" aria-label={`Excluir empresa ${emp.nome}`} carregando={ocupado}
            onClick={() => window.confirm(`Excluir a empresa ${emp.nome}? Só é possível sem unidades.`) && void rodar(() => servidor.excluirEmpresa(emp.id), `Empresa ${emp.nome} excluída.`)}>
            <Trash2 className="size-4" aria-hidden /> Excluir
          </Botao>
        </div>
      )}
      <ul className="mt-2">{emp.unidades.map(linhaUnidade)}</ul>
      {!emp.unidades.length && <p className="mt-2 text-sm text-gray-700">Nenhuma unidade cadastrada.</p>}
      {unidade && !unidade.id && unidade.rede_id === emp.id ? formUnidade(unidade) : (
        <Botao variante="secundario" className="mt-3" onClick={() => setUnidade({ rede_id: emp.id, nome: "", cnpj: "", ativo: true, usaMetas: true, dados: dadosVazios() })}>
          <Plus className="size-4" aria-hidden /> Nova unidade em {emp.nome}
        </Botao>
      )}
    </Cartao>
  );

  return (
    <>
      <Titulo>Empresas e lojas</Titulo>
      <Aviso tom="info">
        Cadastro único do Ecossistema TB: as mesmas empresas e lojas do Portal e dos outros sistemas. Só o administrador altera.
        Marque "Usa o Meta de Vendas" nas lojas que vão ter meta; depois dê os acessos em <b>Usuários e acessos</b>.
      </Aviso>
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <Cartao>
        <form onSubmit={criarEmpresa} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Campo rotulo="Nova empresa (rede)"><input className={classeEntrada} value={novaEmpresa} maxLength={80} onChange={(e) => setNovaEmpresa(e.target.value)} placeholder="Ex.: SUPERMIX BRAZ" /></Campo>
          </div>
          <Botao type="submit" carregando={ocupado} disabled={!novaEmpresa.trim()}><Plus className="size-4" aria-hidden /> Cadastrar empresa</Botao>
        </form>
      </Cartao>
      {!lista.dados.length ? <Vazio>Nenhuma empresa cadastrada.</Vazio> : lista.dados.map(cartaoEmpresa)}
    </>
  );
}
