// Cadastro único (cliente / fornecedor / funcionário / usuário) com as abas DADOS | LOGIN E PERMISSÕES (esta só para o admin).
import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { buscarCep, buscarCnpj, cnpjValido, cpfValido, formatarDocumento, soDigitos } from "@/lib/documento";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { chamarAdminUsuarios } from "@/components/gerenciar-acesso";
import { AbaLogin } from "@/components/aba-login";

export interface Pessoa {
  id: string;
  tipo: "F" | "J";
  documento: string | null;
  nome: string;
  nome_fantasia: string | null;
  ie: string | null;
  im: string | null;
  data_nascimento: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cod_ibge: string | null;
  situacao_cadastral: string | null;
  atividade: string | null;
  observacao: string | null;
  eh_cliente: boolean;
  eh_fornecedor: boolean;
  eh_usuario: boolean;
  eh_funcionario: boolean;
  cargo: string | null;
  aceita_whatsapp: boolean;
  user_id: string | null;
  ativo: boolean;
}

const VAZIO: Omit<Pessoa, "id"> = {
  tipo: "F", documento: null, nome: "", nome_fantasia: null, ie: null, im: null, data_nascimento: null, email: null,
  telefone: null, celular: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null,
  uf: null, cod_ibge: null, situacao_cadastral: null, atividade: null, observacao: null,
  eh_cliente: true, eh_fornecedor: false, eh_usuario: false, eh_funcionario: false, cargo: null, aceita_whatsapp: true, user_id: null, ativo: true,
};

export type AbaPessoa = "dados" | "login";

export function PessoaForm({ pessoa: pessoaInicial, inicial, abaInicial = "dados", onClose, onSalvo }: {
  pessoa: Pessoa | null; inicial?: Partial<Pessoa>; abaInicial?: AbaPessoa; onClose: () => void; onSalvo: () => void;
}) {
  const { role } = useAuth();
  const admin = role === "admin";
  const gestor = admin || role === "gerente";
  // cadastro novo: depois de salvo, a janela continua aberta (o admin pode ir para LOGIN E PERMISSÕES)
  const [pessoa, setPessoa] = useState<Pessoa | null>(pessoaInicial);
  const [aba, setAba] = useState<AbaPessoa>(admin && pessoaInicial ? abaInicial : "dados");
  const [p, setP] = useState<Omit<Pessoa, "id">>(pessoaInicial ? { ...pessoaInicial } : { ...VAZIO, ...inicial });
  const [doc, setDoc] = useState(pessoaInicial?.documento ? formatarDocumento(pessoaInicial.documento) : "");
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const set = <K extends Exclude<keyof Pessoa, "id">>(k: K, v: Pessoa[K]) => setP((x) => ({ ...x, [k]: v }));
  const digitos = soDigitos(doc);
  const ehCnpj = digitos.length > 11;

  /** A aba de login mudou a pessoa (login criado/excluído): atualiza sem perder o que foi digitado em DADOS. */
  function loginMudou(nova: Pessoa) {
    setPessoa(nova);
    setP((x) => ({ ...x, user_id: nova.user_id, eh_usuario: nova.eh_usuario, email: x.email ?? nova.email }));
    onSalvo();
  }

  useEffect(() => {
    set("tipo", ehCnpj ? "J" : "F");
  }, [ehCnpj]);

  async function pesquisarCnpj() {
    setBuscando(true);
    try {
      const e = await buscarCnpj(digitos);
      setP((x) => ({ ...x, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v != null && v !== "")) }));
      toast.success(`Dados de ${e.nome} preenchidos.`);
      if (e.situacao_cadastral && e.situacao_cadastral !== "ATIVA") toast.warning(`Atenção: CNPJ com situação "${e.situacao_cadastral}" na Receita.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  async function pesquisarCep() {
    try {
      const e = await buscarCep(p.cep ?? "");
      setP((x) => ({ ...x, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v != null && v !== "")) }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (digitos && !(digitos.length === 11 ? cpfValido(digitos) : cnpjValido(digitos))) return toast.error(`${ehCnpj ? "CNPJ" : "CPF"} inválido.`);
    if (!p.nome.trim()) return toast.error(ehCnpj ? "Informe a razão social." : "Informe o nome.");
    if (!p.eh_cliente && !p.eh_fornecedor && !p.eh_usuario && !p.eh_funcionario) return toast.error("Marque pelo menos um: Cliente, Fornecedor ou Funcionário.");
    setSalvando(true);
    // user_id e eh_usuario são da aba LOGIN E PERMISSÕES (função de servidor), não do formulário
    const { user_id: _u, eh_usuario: _e, ...dados } = p;
    const registro = { ...dados, documento: digitos || null, nome: p.nome.trim(), uf: p.uf ? p.uf.toUpperCase() : null, email: p.email || null };
    const r = pessoa
      ? await supabase.from("pessoas").update(registro).eq("id", pessoa.id).select("*").single()
      : await supabase.from("pessoas").insert(registro).select("*").single();
    if (r.error) {
      setSalvando(false);
      return toast.error(r.error.message.includes("duplicate") ? `Já existe cadastro com esse ${ehCnpj ? "CNPJ" : "CPF"}.` : r.error.message);
    }
    if (pessoa && pessoa.ativo !== p.ativo && p.user_id && admin) {
      try { await chamarAdminUsuarios({ acao: "ativo", user_id: p.user_id, ativo: p.ativo }); } catch (err) { toast.error("Cadastro salvo, mas o acesso não mudou: " + (err as Error).message); }
    }
    setSalvando(false);
    onSalvo();
    if (!pessoa && admin) {
      // cadastro novo: fica aberto para o admin criar o login, se quiser
      setPessoa(r.data as Pessoa);
      toast.success("Cadastro salvo. Para dar acesso ao sistema, use a aba LOGIN E PERMISSÕES.");
      return;
    }
    toast.success("Cadastro salvo.");
    onClose();
  }

  const campo = (k: Exclude<keyof Pessoa, "id">, label: string, extra: { className?: string; placeholder?: string; type?: string } = {}) => (
    <div className={extra.className}>
      <Label className="text-xs">{label}</Label>
      <Input type={extra.type} value={(p[k] as string | null) ?? ""} placeholder={extra.placeholder} onChange={(e) => set(k, (e.target.value || null) as never)} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pessoa ? pessoa.nome || "Editar cadastro" : "Novo cadastro"}</DialogTitle>
          <DialogDescription>Cliente, fornecedor, funcionário e/ou usuário do sistema.</DialogDescription>
        </DialogHeader>
        {admin && (
          <div className="inline-flex w-fit rounded-lg border bg-card p-1" role="tablist">
            {([["dados", "DADOS"], ["login", "LOGIN E PERMISSÕES"]] as const).map(([id, nome]) => (
              <button key={id} type="button" role="tab" aria-selected={aba === id} disabled={id === "login" && !pessoa}
                title={id === "login" && !pessoa ? "Salve o cadastro primeiro" : undefined}
                onClick={() => setAba(id)}
                className={cn("rounded-md px-3 py-1.5 text-sm font-bold disabled:opacity-40", aba === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {nome}
              </button>
            ))}
          </div>
        )}
        {aba === "login" && pessoa ? <AbaLogin key={pessoa.id} pessoa={pessoa} onMudou={loginMudou} /> : (
        <form onSubmit={salvar} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {([
              ["eh_cliente", "Cliente", true],
              ["eh_fornecedor", "Fornecedor", gestor],
              ["eh_funcionario", "Funcionário", gestor],
            ] as const).map(([k, l, pode]) => (
              <label key={k} className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", p[k] && "border-primary bg-primary/5", !pode && "opacity-50")}>
                <input type="checkbox" className="size-4 accent-primary" checked={p[k]} disabled={!pode} onChange={(e) => set(k, e.target.checked)} />
                {l}
              </label>
            ))}
            {p.user_id && <span className="flex items-center rounded-md border border-primary bg-primary/5 px-3 py-2 text-sm">Tem login de acesso</span>}
          </div>

          {pessoa && (gestor || p.eh_cliente) && (
            <label className={cn("flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-sm", !p.ativo && "border-destructive/50 bg-destructive/5")}>
              <input type="checkbox" className="size-4 accent-primary" checked={p.ativo} onChange={(e) => set("ativo", e.target.checked)} />
              {p.ativo ? "Cadastro ativo" : "Cadastro INATIVO (não aparece para vender/lançar)"}
            </label>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">CPF ou CNPJ</Label>
              <Input value={doc} onChange={(e) => setDoc(formatarDocumento(e.target.value))} inputMode="numeric" placeholder="Digite só os números" />
            </div>
            {ehCnpj && (
              <Button type="button" variant="outline" onClick={pesquisarCnpj} disabled={buscando || digitos.length !== 14}>
                {buscando ? <Loader2 className="animate-spin" /> : <Search />} Pesquisar CNPJ
              </Button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {campo("nome", ehCnpj ? "Razão social" : "Nome completo", { className: "sm:col-span-2" })}
            {ehCnpj ? campo("nome_fantasia", "Nome fantasia") : campo("data_nascimento", "Data de nascimento", { type: "date" })}
            {ehCnpj ? campo("ie", "Inscrição estadual") : campo("ie", "RG (opcional)")}
            {p.eh_funcionario && campo("cargo", "Cargo / função")}
            {campo("email", "E-mail")}
            <div>
              {campo("celular", "Celular / WhatsApp")}
              <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" className="size-3.5 accent-primary" checked={p.aceita_whatsapp} onChange={(e) => set("aceita_whatsapp", e.target.checked)} /> Aceita receber ofertas pelo WhatsApp</label>
            </div>
            {campo("telefone", "Telefone")}
            {ehCnpj && p.situacao_cadastral && <div className="text-xs text-muted-foreground sm:col-span-2">Receita: {p.situacao_cadastral}{p.atividade ? ` · ${p.atividade}` : ""}</div>}
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="text-sm font-medium">Endereço</div>
            <div className="flex items-end gap-2">
              <div className="w-40"><Label className="text-xs">CEP</Label><Input value={p.cep ?? ""} onChange={(e) => set("cep", soDigitos(e.target.value).slice(0, 8) || null)} inputMode="numeric" /></div>
              <Button type="button" variant="outline" size="sm" onClick={pesquisarCep} disabled={soDigitos(p.cep ?? "").length !== 8}><Search /> Buscar CEP</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-6">
              {campo("logradouro", "Rua / Avenida", { className: "sm:col-span-4" })}
              {campo("numero", "Número", { className: "sm:col-span-2" })}
              {campo("complemento", "Complemento", { className: "sm:col-span-2" })}
              {campo("bairro", "Bairro", { className: "sm:col-span-2" })}
              {campo("cidade", "Cidade", { className: "sm:col-span-1" })}
              {campo("uf", "UF", { className: "sm:col-span-1" })}
            </div>
          </div>

          {campo("observacao", "Observação")}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
            <Button type="submit" disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : "Salvar"}</Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
