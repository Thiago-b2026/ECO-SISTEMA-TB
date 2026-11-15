// Cadastro da unidade — o MESMO padrão de todos os sistemas do ecossistema ("Dados da unidade" do PDV):
// começa pelo CNPJ, "Pesquisar CNPJ" preenche os dados da Receita (BrasilAPI), "Buscar CEP" completa o endereço.
// Grava nos mesmos campos de public.lojas.
import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CAMPOS_UNIDADE, normalizarDados, type CampoUnidade, type DadosUnidade, type NovaUnidade } from "../data/servidor";
import { buscarCep, buscarCnpj, cnpjValido, formatarDocumento, soDigitos } from "../lib/documento";
import { Aviso, Botao, Campo, classeEntrada } from "./base";

export type FormUnidadeValor = Omit<NovaUnidade, "cnpj"> & { cnpj: string };

/** Para uma unidade nova: CNPJ e endereço são obrigatórios (o padrão do cadastro). */
export function validarUnidade(u: FormUnidadeValor): string | null {
  const cnpj = soDigitos(u.cnpj);
  if (!u.id && !cnpj) return "Informe o CNPJ da unidade.";
  if (cnpj && !cnpjValido(cnpj)) return "CNPJ inválido: confira os números.";
  if (!u.nome.trim()) return "Informe o nome da unidade no sistema.";
  if (!u.id) {
    const d = normalizarDados(u.dados);
    const faltam = ([["logradouro", "rua"], ["numero", "número"], ["cidade", "cidade"], ["uf", "UF"]] as const).filter(([k]) => !d[k]).map(([, n]) => n);
    if (faltam.length) return `Complete o endereço: ${faltam.join(", ")}. Dica: "Pesquisar CNPJ" ou "Buscar CEP" preenchem sozinhos.`;
  }
  if (u.dados.uf && !/^[A-Za-z]{2}$/.test(u.dados.uf.trim())) return "UF com 2 letras (ex.: SP).";
  return null;
}

export function FormUnidade({ valor, mudar, salvar, cancelar, ocupado }: {
  valor: FormUnidadeValor;
  mudar: (u: FormUnidadeValor) => void;
  salvar: (u: FormUnidadeValor) => void;
  cancelar: () => void;
  ocupado: boolean;
}) {
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const u = valor;
  const d = u.dados;
  const dig = soDigitos(u.cnpj);
  const set = (k: CampoUnidade, v: string) => mudar({ ...u, dados: { ...d, [k]: v } });
  const juntar = (novos: DadosUnidade) => ({ ...d, ...Object.fromEntries(Object.entries(novos).filter(([, v]) => v)) });

  async function pesquisarCnpj() {
    setBuscando(true);
    setAviso(null);
    try {
      const e = await buscarCnpj(dig);
      const { nome: razao, ...resto } = e;
      mudar({ ...u, nome: u.nome || e.nome_fantasia || razao, dados: juntar({ ...resto, razao_social: razao }) });
      setAviso({ tom: "ok", texto: "Dados da Receita preenchidos. Confira e salve." });
    } catch (x) {
      setAviso({ tom: "erro", texto: (x as Error).message });
    } finally {
      setBuscando(false);
    }
  }

  async function pesquisarCep() {
    setAviso(null);
    try {
      mudar({ ...u, dados: juntar(await buscarCep(d.cep ?? "")) });
    } catch (x) {
      setAviso({ tom: "erro", texto: (x as Error).message });
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const erro = validarUnidade(u);
    if (erro) return setAviso({ tom: "erro", texto: erro });
    salvar(u);
  }

  const campo = (k: CampoUnidade, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Campo rotulo={rotulo}><input className={classeEntrada} value={d[k] ?? ""} onChange={(e) => set(k, e.target.value)} {...extra} /></Campo>
  );

  return (
    <form onSubmit={enviar} className="mt-3 space-y-3 rounded-lg border-2 border-marca-claro bg-gray-50 p-3" aria-label={u.id ? `Editar ${u.nome}` : "Nova unidade"}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-64">
          <Campo rotulo={u.id ? "CNPJ" : "CNPJ (obrigatório)"} ajuda="Final /0001 = matriz; outro final = filial.">
            <input className={classeEntrada} inputMode="numeric" value={u.cnpj} autoFocus placeholder="00.000.000/0000-00"
              onChange={(e) => mudar({ ...u, cnpj: formatarDocumento(e.target.value) })} />
          </Campo>
        </div>
        <Botao type="button" variante="secundario" carregando={buscando} disabled={dig.length !== 14} onClick={() => void pesquisarCnpj()}>
          <Search className="size-4" aria-hidden /> Pesquisar CNPJ
        </Botao>
      </div>
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome da unidade no sistema"><input className={classeEntrada} value={u.nome} maxLength={80} onChange={(e) => mudar({ ...u, nome: e.target.value })} placeholder="Ex.: Supermix Loja 1" /></Campo>
        {campo("nome_fantasia", "Nome fantasia")}
        <div className="sm:col-span-2">{campo("razao_social", "Razão social")}</div>
        {campo("ie", "Inscrição estadual")}
        {campo("im", "Inscrição municipal")}
        <Campo rotulo="Regime tributário">
          <select className={classeEntrada} value={d.regime_tributario ?? ""} onChange={(e) => set("regime_tributario", e.target.value)}>
            <option value="">—</option>
            <option value="mei">MEI</option>
            <option value="simples">Simples Nacional</option>
            <option value="simples_excesso">Simples Nacional – excesso de sublimite</option>
            <option value="presumido">Lucro Presumido</option>
            <option value="real">Lucro Real</option>
          </select>
        </Campo>
        {campo("telefone", "Telefone", { inputMode: "tel" })}
        {campo("email", "E-mail", { type: "email" })}
        {d.situacao_cadastral && <p className="self-end text-xs text-gray-700">Receita: {d.situacao_cadastral}{d.atividade ? ` · ${d.atividade}` : ""}</p>}
      </div>

      <fieldset className="space-y-3 rounded-lg border border-gray-300 bg-white p-3">
        <legend className="px-1 text-sm font-semibold text-gray-800">Endereço</legend>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">{campo("cep", "CEP", { inputMode: "numeric", maxLength: 9 })}</div>
          <Botao type="button" variante="secundario" disabled={soDigitos(d.cep ?? "").length !== 8} onClick={() => void pesquisarCep()}>
            <Search className="size-4" aria-hidden /> Buscar CEP
          </Botao>
        </div>
        <div className="grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-4">{campo("logradouro", "Rua / Avenida")}</div>
          <div className="sm:col-span-2">{campo("numero", "Número")}</div>
          <div className="sm:col-span-2">{campo("complemento", "Complemento")}</div>
          <div className="sm:col-span-2">{campo("bairro", "Bairro")}</div>
          <div className="sm:col-span-1">{campo("cidade", "Cidade")}</div>
          <div className="sm:col-span-1">{campo("uf", "UF", { maxLength: 2 })}</div>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-4">
        <label className="flex min-h-12 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={u.usaMetas} onChange={(e) => mudar({ ...u, usaMetas: e.target.checked })} /> Usa o Meta de Vendas
        </label>
        <label className="flex min-h-12 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={u.ativo} onChange={(e) => mudar({ ...u, ativo: e.target.checked })} /> Ativa
        </label>
      </div>
      <div className="flex gap-2">
        <Botao type="submit" carregando={ocupado}>Salvar unidade</Botao>
        <Botao type="button" variante="secundario" onClick={cancelar}>Cancelar</Botao>
      </div>
    </form>
  );
}

/** Endereço numa linha, para a lista. */
export const enderecoCurto = (d: DadosUnidade = {}) =>
  [d.logradouro && `${d.logradouro}${d.numero ? `, ${d.numero}` : ""}`, d.bairro, d.cidade && `${d.cidade}${d.uf ? `/${d.uf}` : ""}`].filter(Boolean).join(" · ");

/** Garante todas as chaves (para o formulário controlado). */
export const dadosVazios = (d: DadosUnidade = {}): DadosUnidade => Object.fromEntries(CAMPOS_UNIDADE.map((k) => [k, d[k] ?? ""]));
