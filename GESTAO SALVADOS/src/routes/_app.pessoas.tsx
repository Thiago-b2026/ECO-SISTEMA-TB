import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetch-all";
import { formatarDocumento } from "@/lib/documento";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PessoaForm, type Pessoa } from "@/components/pessoa-form";
import { Exportar } from "@/components/exportar";
import { SISTEMAS } from "@/lib/telas";
import { useAuth, type AppRole } from "@/lib/auth";
import { VendedorasLegado } from "@/components/vendedoras-legado";

const PORTAL = SISTEMAS.find((x) => x.codigo === "portal");


type Filtro = "todos" | "cliente" | "fornecedor" | "funcionario" | "usuario";
const FILTROS: Filtro[] = ["todos", "cliente", "fornecedor", "funcionario", "usuario"];

export const Route = createFileRoute("/_app/pessoas")({
  validateSearch: (s: Record<string, unknown>): { filtro?: Filtro } =>
    typeof s.filtro === "string" && FILTROS.includes(s.filtro as Filtro) && s.filtro !== "todos" ? { filtro: s.filtro as Filtro } : {},
  component: PaginaPessoas,
});

const PAPEL: Record<AppRole, string> = { admin: "Admin", gerente: "Gerente", vendedor: "Vendedor", estoquista: "Estoquista" };

/** CADASTROS → PESSOAS. Ao abrir uma pessoa: abas DADOS | LOGIN E PERMISSÕES (esta só para o admin). */
function PaginaPessoas() {
  const { role } = useAuth();
  const admin = role === "admin";
  const busca0 = Route.useSearch();
  const navigate = useNavigate({ from: "/pessoas" });
  const filtro: Filtro = busca0.filtro ?? "todos";
  const setFiltro = (f: Filtro) => navigate({ search: f === "todos" ? {} : { filtro: f }, replace: true });
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  /** situação do login de cada usuário (perfil e ativo) */
  const [acesso, setAcesso] = useState<Map<string, { papel: AppRole | null; ativo: boolean }>>(new Map());
  const [busca, setBusca] = useState("");
  const [inativos, setInativos] = useState(false);
  const [editando, setEditando] = useState<Pessoa | null | "novo">(null);

  async function carregar() {
    try {
      const [ps, roles, profs] = await Promise.all([
        fetchAllRows<Pessoa>(() => supabase.from("pessoas").select("*").order("nome")),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("id, ativo"),
      ]);
      const papel = new Map((roles.data ?? []).map((x) => [x.user_id as string, x.role as AppRole]));
      setAcesso(new Map((profs.data ?? []).map((x) => [x.id as string, { papel: papel.get(x.id as string) ?? null, ativo: x.ativo !== false }])));
      setPessoas(ps);
    } catch (e) {
      toast.error((e as Error).message);
      setPessoas([]);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const dig = t.replace(/\D/g, "");
    return (pessoas ?? []).filter(
      (p) =>
        (inativos || p.ativo) &&
        (filtro === "todos" || (filtro === "cliente" && p.eh_cliente) || (filtro === "fornecedor" && p.eh_fornecedor) || (filtro === "funcionario" && p.eh_funcionario) || (filtro === "usuario" && p.eh_usuario)) &&
        (!t || p.nome.toLowerCase().includes(t) || (p.nome_fantasia ?? "").toLowerCase().includes(t) || (dig.length >= 3 && (p.documento ?? "").includes(dig)) || (p.email ?? "").toLowerCase().includes(t)),
    );
  }, [pessoas, filtro, busca, inativos]);

  const conta = (f: (p: Pessoa) => boolean) => (pessoas ?? []).filter(f).length;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold uppercase">Pessoas</h1>
          <p className="text-sm text-muted-foreground">Clientes, fornecedores, funcionários e usuários num só lugar. Abra a pessoa para ver os dados{admin ? " e o login e as permissões" : ""}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Exportar titulo="Cadastros" subtitulo={filtro === "todos" ? "todos" : filtro}
            colunas={[{ titulo: "Nome / razão social" }, { titulo: "Fantasia" }, { titulo: "CPF/CNPJ" }, { titulo: "Celular" }, { titulo: "E-mail" }, { titulo: "Cidade" }, { titulo: "UF" }, { titulo: "É" }, { titulo: "Ativo" }]}
            linhas={() => visiveis.map((p) => [p.nome, p.nome_fantasia ?? "", p.documento ? formatarDocumento(p.documento) : "", p.celular ?? p.telefone ?? "", p.email ?? "", p.cidade ?? "", p.uf ?? "", [p.eh_cliente && "cliente", p.eh_fornecedor && "fornecedor", p.eh_funcionario && "funcionário", p.eh_usuario && "login"].filter(Boolean).join(", "), p.ativo ? "sim" : "não"])} />
          <Button onClick={() => setEditando("novo")}><Plus /> Novo cadastro</Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {([
            ["todos", `Todos (${pessoas?.length ?? 0})`],
            ["cliente", `Clientes (${conta((p) => p.eh_cliente)})`],
            ["fornecedor", `Fornecedores (${conta((p) => p.eh_fornecedor)})`],
            ["funcionario", `Funcionários (${conta((p) => p.eh_funcionario)})`],
            ["usuario", `Login de acesso (${conta((p) => p.eh_usuario)})`],
          ] as const).map(([f, l]) => (
            <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)}>{l}</Button>
          ))}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, fantasia, CPF/CNPJ ou e-mail" className="pl-8" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>
        </div>

        {pessoas == null ? <Loader2 className="animate-spin text-muted-foreground" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b"><th className="py-2 pr-2">Nome</th><th className="py-2 pr-2">CPF/CNPJ</th><th className="py-2 pr-2 hidden md:table-cell">Contato</th><th className="py-2 pr-2 hidden lg:table-cell">Cidade</th><th className="py-2 pr-2">É</th><th className="py-2 pr-2">Tem login</th><th className="py-2"></th></tr>
              </thead>
              <tbody>
                {visiveis.slice(0, 500).map((p) => (
                  <tr key={p.id} className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 ${p.ativo ? "" : "opacity-50"}`} onClick={() => setEditando(p)}>
                    <td className="py-2 pr-2"><div className="font-medium">{p.nome}</div>{p.nome_fantasia && <div className="text-xs text-muted-foreground">{p.nome_fantasia}</div>}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{p.documento ? formatarDocumento(p.documento) : "—"}</td>
                    <td className="py-2 pr-2 text-xs hidden md:table-cell">{[p.celular || p.telefone, p.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="py-2 pr-2 text-xs hidden lg:table-cell">{p.cidade ? `${p.cidade}/${p.uf ?? ""}` : "—"}</td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap gap-1">
                        {!p.ativo && <Badge variant="destructive">Inativo</Badge>}
                        {p.eh_cliente && <Badge variant="outline">Cliente</Badge>}
                        {p.eh_fornecedor && <Badge variant="secondary">Fornecedor</Badge>}
                        {p.eh_funcionario && <Badge variant="secondary">Funcionário{p.cargo ? ` · ${p.cargo}` : ""}</Badge>}
                        {p.eh_usuario && <Badge>{p.user_id ? "Login de acesso" : "Login (não criado)"}</Badge>}
                      </div>
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {!p.user_id ? <span className="text-muted-foreground">Não</span>
                        : acesso.get(p.user_id)?.ativo === false ? <span className="font-medium text-destructive">Desativado</span>
                        : <span className="font-medium text-success">Sim</span>}
                      {p.user_id && acesso.get(p.user_id)?.papel && <span className="ml-1 text-xs text-muted-foreground">· {PAPEL[acesso.get(p.user_id)!.papel!]}</span>}
                    </td>
                    <td className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!PORTAL?.ativo}
                        title={PORTAL?.ativo ? "Abrir esta pessoa no Portal (login e acessos)" : "O Portal ainda não está no ar"}
                        onClick={() => PORTAL?.url && window.open(PORTAL.url, "_blank", "noopener")}
                      >
                        Abrir no Portal
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visiveis.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cadastro.</p>}
          </div>
        )}
      </Card>

      {admin && filtro === "usuario" && <VendedorasLegado usuarios={(pessoas ?? []).filter((p) => p.user_id).map((p) => ({ id: p.user_id!, nome: p.nome }))} />}

      {editando && (
        <PessoaForm
          pessoa={editando === "novo" ? null : editando}
          abaInicial={filtro === "usuario" ? "login" : "dados"}
          inicial={filtro === "usuario" ? { eh_funcionario: true, eh_cliente: false } : undefined}
          onClose={() => setEditando(null)}
          onSalvo={carregar}
        />
      )}
    </div>
  );
}
