// Formulário do cadastro único (cliente / fornecedor / usuário).
import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth, type AppRole } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { buscarCep, buscarCnpj, cnpjValido, cpfValido, formatarDocumento, soDigitos } from "@/lib/documento";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
  user_id: string | null;
  ativo: boolean;
}

const VAZIO: Omit<Pessoa, "id"> = {
  tipo: "F", documento: null, nome: "", nome_fantasia: null, ie: null, im: null, data_nascimento: null, email: null,
  telefone: null, celular: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null,
  uf: null, cod_ibge: null, situacao_cadastral: null, atividade: null, observacao: null,
  eh_cliente: true, eh_fornecedor: false, eh_usuario: false, eh_funcionario: false, cargo: null, user_id: null, ativo: true,
};

const PAPEIS: { id: AppRole; label: string }[] = [
  { id: "vendedor", label: "Vendedor" }, { id: "estoquista", label: "Estoquista" }, { id: "gerente", label: "Gerente" }, { id: "admin", label: "Admin" },
];

export function PessoaForm({ pessoa, onClose, onSalvo }: { pessoa: Pessoa | null; onClose: () => void; onSalvo: () => void }) {
  const { role } = useAuth();
  const { lojas } = useLoja();
  const admin = role === "admin";
  const gestor = admin || role === "gerente";
  const [p, setP] = useState<Omit<Pessoa, "id">>(pessoa ? { ...pessoa } : { ...VAZIO });
  const [doc, setDoc] = useState(pessoa?.documento ? formatarDocumento(pessoa.documento) : "");
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // acesso ao sistema (só quando vai criar o login agora)
  const [login, setLogin] = useState(pessoa?.email ?? "");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<AppRole>("vendedor");
  const [lojasSel, setLojasSel] = useState<string[]>([]);
  useEffect(() => {
    if (lojas.length === 1) setLojasSel([lojas[0].id]);
  }, [lojas]);

  const set = <K extends Exclude<keyof Pessoa, "id">>(k: K, v: Pessoa[K]) => setP((x) => ({ ...x, [k]: v }));
  const digitos = soDigitos(doc);
  const ehCnpj = digitos.length > 11;
  const criandoLogin = p.eh_usuario && !p.user_id;

  useEffect(() => {
    set("tipo", ehCnpj ? "J" : "F");
  }, [ehCnpj]);

  async function pesquisarCnpj() {
    setBuscando(true);
    try {
      const e = await buscarCnpj(digitos);
      setP((x) => ({ ...x, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v != null && v !== "")) }));
      if (e.email && !login) setLogin(e.email);
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
    if (!p.eh_cliente && !p.eh_fornecedor && !p.eh_usuario && !p.eh_funcionario) return toast.error("Marque pelo menos um: Cliente, Fornecedor, Funcionário ou Usuário.");
    if (criandoLogin) {
      if (!/^\S+@\S+\.\S+$/.test(login)) return toast.error("Informe o e-mail de login do usuário.");
      if (senha.length < 8) return toast.error("A senha do usuário precisa ter pelo menos 8 caracteres.");
      if (lojasSel.length === 0) return toast.error("Marque as lojas em que o usuário trabalha.");
    }
    setSalvando(true);
    const { user_id: _u, ...dados } = p;
    const registro = { ...dados, documento: digitos || null, nome: p.nome.trim(), uf: p.uf ? p.uf.toUpperCase() : null, email: p.email || (criandoLogin ? login : null) };
    const r = pessoa
      ? await supabase.from("pessoas").update(registro).eq("id", pessoa.id).select("id").single()
      : await supabase.from("pessoas").insert(registro).select("id").single();
    if (r.error) {
      setSalvando(false);
      return toast.error(r.error.message.includes("duplicate") ? `Já existe cadastro com esse ${ehCnpj ? "CNPJ" : "CPF"}.` : r.error.message);
    }
    if (criandoLogin) {
      const { error } = await supabase.functions.invoke("admin-usuarios", {
        body: { acao: "criar", nome: p.nome.trim(), email: login.trim().toLowerCase(), senha, papel, lojas: lojasSel, pessoa_id: r.data.id },
      });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const b = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
        setSalvando(false);
        toast.error("Cadastro salvo, mas o acesso NÃO foi criado: " + (b?.erro ?? error.message));
        onSalvo();
        return;
      }
      toast.success(`Cadastro salvo e acesso criado para ${login}.`);
    } else {
      toast.success("Cadastro salvo.");
    }
    setSalvando(false);
    onSalvo();
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
          <DialogTitle>{pessoa ? "Editar cadastro" : "Novo cadastro"}</DialogTitle>
          <DialogDescription>Cliente, fornecedor e/ou usuário do sistema — marque o que ele é.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {([
              ["eh_cliente", "Cliente", true],
              ["eh_fornecedor", "Fornecedor", gestor],
              ["eh_funcionario", "Funcionário", gestor],
              ["eh_usuario", "Login de acesso", admin || !!p.user_id],
            ] as const).map(([k, l, pode]) => (
              <label key={k} className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", p[k] && "border-primary bg-primary/5", !pode && "opacity-50")}>
                <input type="checkbox" className="size-4 accent-primary" checked={p[k]} disabled={!pode || (k === "eh_usuario" && !!p.user_id)} onChange={(e) => set(k, e.target.checked)} />
                {l}
              </label>
            ))}
          </div>

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
            {campo("celular", "Celular / WhatsApp")}
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

          {p.eh_usuario && (
            <div className="space-y-2 rounded-lg border border-primary/40 p-3">
              <div className="text-sm font-medium">Acesso ao sistema</div>
              {p.user_id ? (
                <p className="text-sm text-muted-foreground">Este cadastro já tem acesso. Perfil, senha e desativação ficam na tela <b>Usuários</b>; as lojas, na tela <b>Lojas</b>.</p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div><Label className="text-xs">E-mail de login</Label><Input type="email" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" /></div>
                    <div><Label className="text-xs">Senha inicial (mín. 8)</Label><Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" /></div>
                  </div>
                  <div className="text-xs font-medium">Permissão</div>
                  <div className="flex flex-wrap gap-1">
                    {PAPEIS.map((x) => <Button key={x.id} type="button" size="sm" variant={papel === x.id ? "default" : "outline"} onClick={() => setPapel(x.id)}>{x.label}</Button>)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Vendedor: PDV, caixa e vendas · Estoquista: lotes e estoque · Gerente: tudo menos usuários · Admin: tudo.
                  </p>
                  <div className="text-xs font-medium">Lojas</div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {lojas.map((l) => (
                      <label key={l.id} className="flex items-center gap-1">
                        <input type="checkbox" className="size-4 accent-primary" checked={lojasSel.includes(l.id)} onChange={(e) => setLojasSel((s) => (e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id)))} /> {l.nome}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {campo("observacao", "Observação")}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
            <Button type="submit" disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
