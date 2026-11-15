import { Link2, Plus, Trash2, UserCheck, UserX } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useApp, useDados } from "../app/contexto";
import { servidor } from "../data/conexao";
import type { Vendedor } from "../data/servidor";
import { Aviso, Botao, Campo, Carregando, Cartao, classeEntrada, Selo, Titulo, Vazio } from "../ui/base";

export default function Vendedores() {
  const { unidade, acesso, pode, recarregar } = useApp();
  const lista = useDados(async () => (unidade ? servidor.vendedores(unidade.id) : []), [unidade?.id]);
  const emails = useDados(async () => (unidade ? servidor.emailsVendedores(unidade.id) : new Map<string, string>()), [unidade?.id]);
  const [nome, setNome] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", loja_id: "", email: "" });
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (lista.erro) return <Aviso tom="erro">{lista.erro}</Aviso>;
  if (lista.carregando || !unidade) return <Carregando />;
  const podeIncluir = pode("metas.vendedores", "inserir");
  const podeEditar = pode("metas.vendedores", "editar");

  async function rodar(fn: () => Promise<void>, ok: string) {
    setOcupado(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tom: "ok", texto: ok });
      recarregar();
    } catch (x) {
      setMsg({ tom: "erro", texto: (x as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  function incluir(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    void rodar(async () => {
      await servidor.salvarVendedor({ loja_id: unidade!.id, nome, ativo: true });
      setNome("");
    }, `${nome.trim()} cadastrado(a).`);
  }

  function abrir(v: Vendedor) {
    setEditando(v.id);
    setForm({ nome: v.nome, loja_id: v.loja_id, email: emails.dados?.get(v.id) ?? "" });
    setMsg(null);
  }

  function salvar(v: Vendedor) {
    void rodar(async () => {
      await servidor.salvarVendedor({ id: v.id, loja_id: form.loja_id, nome: form.nome, ativo: v.ativo });
      const antes = emails.dados?.get(v.id) ?? "";
      if (form.email.trim() !== antes) await servidor.ligarLogin(v.id, form.email.trim() || null);
      setEditando(null);
    }, "Cadastro salvo.");
  }

  const vendedores = lista.dados ?? [];
  return (
    <>
      <Titulo>Vendedores — {unidade.nome}</Titulo>
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      {podeIncluir && (
        <Cartao>
          <form onSubmit={incluir} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Campo rotulo="Novo vendedor (nome)">
                <input className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
              </Campo>
            </div>
            <Botao type="submit" carregando={ocupado} disabled={!nome.trim()}><Plus className="size-4" aria-hidden /> Cadastrar</Botao>
          </form>
        </Cartao>
      )}
      <Aviso tom="info">
        Para o vendedor ver o próprio desempenho, ligue o cadastro ao login dele (o mesmo e-mail do Ecossistema TB). Quem não tem login:
        o administrador cria em <b>Usuários e acessos</b> (perfil Vendedor). Vendedor com lançamento não é excluído: é inativado, e o histórico continua.
      </Aviso>
      {!vendedores.length ? <Vazio>Nenhum vendedor cadastrado nesta unidade.</Vazio> : (
        <ul className="space-y-2">
          {vendedores.map((v) => (
            <li key={v.id}>
              <Cartao>
                {editando === v.id ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo rotulo="Nome"><input className={classeEntrada} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={80} /></Campo>
                    <Campo rotulo="Unidade" ajuda="Os lançamentos antigos continuam na unidade de antes.">
                      <select className={classeEntrada} value={form.loja_id} onChange={(e) => setForm({ ...form, loja_id: e.target.value })}>
                        {(acesso?.unidades ?? []).filter((u) => u.rede_id === unidade.rede_id).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </select>
                    </Campo>
                    <Campo rotulo="E-mail do login" ajuda="Vazio = sem login ligado.">
                      <input className={classeEntrada} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </Campo>
                    <div className="flex gap-2 sm:col-span-3">
                      <Botao carregando={ocupado} onClick={() => salvar(v)} disabled={!form.nome.trim()}>Salvar</Botao>
                      <Botao variante="secundario" onClick={() => setEditando(null)}>Cancelar</Botao>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-40 flex-1 font-semibold">{v.nome}</span>
                    {v.ativo ? <Selo tom="ok" icone={UserCheck}>Ativo</Selo> : <Selo tom="neutro" icone={UserX}>Inativo</Selo>}
                    {v.user_id ? <Selo tom="info" icone={Link2}>{emails.dados?.get(v.id) ?? "Com login"}</Selo> : <Selo tom="neutro">Sem login</Selo>}
                    {podeEditar && (
                      <span className="flex gap-2">
                        <Botao variante="secundario" onClick={() => abrir(v)}>Editar</Botao>
                        <Botao variante={v.ativo ? "fantasma" : "secundario"} carregando={ocupado}
                          onClick={() => void rodar(() => servidor.salvarVendedor({ id: v.id, loja_id: v.loja_id, nome: v.nome, ativo: !v.ativo }).then(() => undefined), v.ativo ? `${v.nome} inativado(a).` : `${v.nome} reativado(a).`)}>
                          {v.ativo ? "Inativar" : "Reativar"}
                        </Botao>
                        <Botao variante="fantasma" className="text-red-800" aria-label={`Excluir ${v.nome}`} carregando={ocupado}
                          onClick={() => window.confirm(`Excluir ${v.nome}? Só é possível se ainda não tem lançamento.`) && void rodar(() => servidor.excluirVendedor(v.id), `${v.nome} excluído(a).`)}>
                          <Trash2 className="size-4" aria-hidden /> Excluir
                        </Botao>
                      </span>
                    )}
                  </div>
                )}
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
