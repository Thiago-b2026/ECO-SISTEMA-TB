import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useEmpresa } from "../contexts/EmpresaContext";
import { useTelas } from "../contexts/TelasContext";
import { PAPEL_LABEL, type Papel } from "../lib/types";
import { Aviso, Card } from "../components/ui";

interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
}

export default function Usuarios() {
  const { user } = useAuth();
  const { empresa, isGestor, papel: meuPapel } = useEmpresa();
  const { admin } = useTelas();
  const [lista, setLista] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "", papel: "operador" as Papel });
  const [editando, setEditando] = useState<(Usuario & { senha: string }) | null>(null);

  const api = useCallback(async (method: string, body?: object) => {
    const { data } = await supabase.auth.getSession();
    const qs = method === "GET" ? `?empresa_id=${empresa!.id}` : "";
    const r = await fetch(`/api/admin-users${qs}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: body ? JSON.stringify({ empresa_id: empresa!.id, ...body }) : undefined,
    });
    if (!r.ok) throw new Error((await r.text()) || `Erro ${r.status}`);
    return r.json();
  }, [empresa?.id]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api("GET");
      setLista(r.users);
    } catch (e) {
      setErro((e as Error).message);
    }
    setCarregando(false);
  }, [api]);

  useEffect(() => {
    if (isGestor || admin) carregar();
  }, [carregar, isGestor, admin]);

  if (!isGestor && !admin) return <Navigate to="/" replace />;

  async function executar(fn: () => Promise<unknown>, sucesso: string) {
    setErro(null);
    setOk(null);
    try {
      await fn();
      setOk(sucesso);
      await carregar();
      return true;
    } catch (e) {
      setErro((e as Error).message);
      return false;
    }
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    const feito = await executar(async () => {
      const r = await api("POST", novo);
      if (r.existente) setTimeout(() => setOk("Usuário já tinha conta e foi adicionado à empresa (a senha dele não mudou)."), 0);
    }, "Usuário criado.");
    if (feito) setNovo({ nome: "", email: "", senha: "", papel: "operador" });
  }

  async function salvarEdicao(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const feito = await executar(
      () => api("PATCH", { id: editando.id, nome: editando.nome, papel: editando.papel, senha: editando.senha || undefined }),
      "Usuário atualizado.",
    );
    if (feito) setEditando(null);
  }

  const opcoesPapel = (["operador", "admin", ...(meuPapel === "owner" ? ["owner"] : [])] as Papel[]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadastro de Usuários</h1>
        <p className="text-sm text-muted-foreground">Gerencie quem acessa a empresa <b className="text-foreground">{empresa!.nome}</b>.</p>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <Card titulo="Novo Usuário">
        <form onSubmit={criar} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] items-end">
          <input className="campo" placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <input className="campo" type="email" placeholder="email@exemplo.com" required value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
          <input className="campo" type="password" placeholder="Senha (mín. 6)" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />
          <select className="campo" value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value as Papel })}>
            {opcoesPapel.map((p) => <option key={p} value={p}>{p === "owner" ? "Dono do Projeto" : PAPEL_LABEL[p]}</option>)}
          </select>
          <button className="btn-primario">Criar usuário</button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">Se o e-mail já tiver conta (em outra empresa), ele só é adicionado aqui e a senha não é necessária.</p>
      </Card>

      {editando && (
        <Card titulo="Editar Usuário" acoes={<button className="text-xs text-muted-foreground" onClick={() => setEditando(null)}>Cancelar</button>}>
          <form onSubmit={salvarEdicao} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] items-end">
            <label className="text-sm">Nome<input className="campo mt-1" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} /></label>
            <label className="text-sm">Perfil
              <select className="campo mt-1" value={editando.papel} disabled={editando.id === user!.id} onChange={(e) => setEditando({ ...editando, papel: e.target.value as Papel })}>
                {(opcoesPapel.includes(editando.papel) ? opcoesPapel : [...opcoesPapel, editando.papel]).map((p) => (
                  <option key={p} value={p}>{p === "owner" ? "Dono do Projeto" : PAPEL_LABEL[p]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">Nova senha (opcional)<input className="campo mt-1" type="password" value={editando.senha} onChange={(e) => setEditando({ ...editando, senha: e.target.value })} /></label>
            <button className="btn-primario">Salvar</button>
          </form>
        </Card>
      )}

      <Card titulo="Usuários">
        {carregando ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">Nome</th>
                  <th className="py-2 px-2 font-medium">Email</th>
                  <th className="py-2 px-2 font-medium">Perfil</th>
                  <th className="py-2 pl-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((u) => {
                  const bloqueado = u.papel === "owner" && meuPapel !== "owner";
                  return (
                    <tr key={u.id} className="border-b border-border/60">
                      <td className="py-2 pr-4">{u.nome || "—"} {u.id === user!.id && <span className="text-xs text-muted-foreground">(você)</span>}</td>
                      <td className="py-2 px-2 text-muted-foreground">{u.email}</td>
                      <td className="py-2 px-2">{PAPEL_LABEL[u.papel]}</td>
                      <td className="py-2 pl-2 text-right space-x-3 whitespace-nowrap">
                        {!bloqueado && <button className="text-xs text-primary hover:underline" onClick={() => setEditando({ ...u, senha: "" })}>Editar</button>}
                        {!bloqueado && u.id !== user!.id && (
                          <button
                            className="text-xs text-danger hover:underline"
                            onClick={() => confirm(`Remover ${u.nome || u.email} desta empresa?`) && executar(() => api("DELETE", { id: u.id }), "Usuário removido.")}
                          >
                            Excluir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
