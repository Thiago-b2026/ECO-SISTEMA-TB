import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Copy, Loader2, MessageCircle, Plus, Send, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { fetchAllRows } from "@/lib/fetch-all";
import { fmtBRL, fmtDate } from "@/lib/format";
import { lerNumero } from "@/lib/precificacao";
import { linkWhatsApp, montarMensagem } from "@/lib/whatsapp";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Barras } from "@/components/relatorios-extra";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/crm")({ component: Crm });

interface Lista { id: string; nome: string; descricao: string | null; tipo: "lista" | "grupo_whatsapp"; link_grupo: string | null }
interface Contato { id: string; nome: string; celular: string | null; telefone: string | null; cidade: string | null; aceita_whatsapp: boolean }
interface Campanha { id: string; nome: string; mensagem: string; lista_id: string | null; produtos: string[]; status: string; created_at: string }
interface Envio { id: string; campanha_id: string; pessoa_id: string | null; destino: string; nome: string | null; status: string; enviado_em: string | null }
interface Produto { id: string; titulo: string; preco_venda: number }
interface Pedido { id: string; campanha_id: string | null; pessoa_id: string | null; produto_id: string | null; descricao: string; quantidade: number; valor: number | null; status: string; created_at: string }
interface Metrica { campanha_id: string; nome: string; criada: string; status: string; envios: number; enviados: number; responderam: number; compraram: number; pedidos: number; valor_pedidos: number }

type Aba = "campanhas" | "listas" | "pedidos" | "metricas";

function Crm() {
  const [aba, setAba] = useState<Aba>("campanhas");
  const [listas, setListas] = useState<Lista[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[] | null>(null);
  const { filtroLoja } = useLoja();

  async function carregarBase() {
    const [l, c, p, cp] = await Promise.all([
      supabase.from("crm_listas").select("*").order("nome"),
      fetchAllRows<Contato>(() => supabase.from("pessoas").select("id, nome, celular, telefone, cidade, aceita_whatsapp").eq("eh_cliente", true).eq("ativo", true).order("nome")),
      fetchAllRows<Produto>(() => {
        let q = supabase.from("produtos").select("id, titulo, preco_venda").eq("ativo", true).gt("estoque_atual", 0).order("titulo");
        if (filtroLoja) q = q.eq("loja_id", filtroLoja);
        return q;
      }),
      supabase.from("crm_campanhas").select("*").order("created_at", { ascending: false }),
    ]);
    if (l.error) return toast.error(l.error.message);
    setListas((l.data ?? []) as Lista[]);
    setContatos(c);
    setProdutos(p);
    setCampanhas((cp.data ?? []) as Campanha[]);
  }
  useEffect(() => {
    carregarBase();
  }, [filtroLoja]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">CRM e WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Monte listas de clientes e grupos, dispare ofertas pelo WhatsApp e acompanhe respostas, pedidos e produtos pedidos. (Envio pelo seu WhatsApp; integração automática com a uazapi entra depois.)</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {([["campanhas", "Campanhas"], ["listas", "Listas e grupos"], ["pedidos", "Pedidos pelo WhatsApp"], ["metricas", "Métricas"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={aba === k ? "default" : "ghost"} onClick={() => setAba(k)}>{l}</Button>
        ))}
      </div>
      {aba === "campanhas" && <Campanhas listas={listas} produtos={produtos} campanhas={campanhas} lojaId={filtroLoja} onMudou={carregarBase} />}
      {aba === "listas" && <Listas listas={listas} contatos={contatos} onMudou={carregarBase} />}
      {aba === "pedidos" && <Pedidos campanhas={campanhas ?? []} contatos={contatos} produtos={produtos} lojaId={filtroLoja} />}
      {aba === "metricas" && <Metricas />}
    </div>
  );
}

// ------------------------------------------------------------------ campanhas
function Campanhas({ listas, produtos, campanhas, lojaId, onMudou }: { listas: Lista[]; produtos: Produto[]; campanhas: Campanha[] | null; lojaId: string | null; onMudou: () => void }) {
  const { user } = useAuth();
  const [nova, setNova] = useState(false);
  const [nome, setNome] = useState("");
  const [mensagem, setMensagem] = useState("Oi {primeiro_nome}! 👋 Chegaram novidades na loja com preço de salvado:\n{produtos}\n\nResponda aqui que separamos pra você!");
  const [listaId, setListaId] = useState("");
  const [prodSel, setProdSel] = useState<string[]>([]);
  const [buscaProd, setBuscaProd] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);

  const prods = (ids: string[]) => produtos.filter((p) => ids.includes(p.id)).map((p) => ({ titulo: p.titulo, preco: Number(p.preco_venda) }));

  async function criar() {
    if (!nome.trim() || !mensagem.trim() || !listaId) return toast.error("Dê um nome, escreva a mensagem e escolha a lista.");
    const { error } = await supabase.from("crm_campanhas").insert({ nome: nome.trim(), mensagem, lista_id: listaId, produtos: prodSel, loja_id: lojaId });
    if (error) return toast.error(error.message);
    toast.success("Campanha criada. Abra e clique em Preparar envios.");
    setNova(false); setNome(""); setProdSel([]);
    onMudou();
  }

  async function abrir(c: Campanha) {
    if (aberta === c.id) return setAberta(null);
    setAberta(c.id);
    const { data } = await supabase.from("crm_envios").select("*").eq("campanha_id", c.id).order("nome");
    setEnvios((data ?? []) as Envio[]);
  }

  async function preparar(c: Campanha) {
    const { data, error } = await supabase.rpc("preparar_envios", { _campanha_id: c.id });
    if (error) return toast.error(error.message);
    toast.success(`${data} contato(s) na fila.`);
    const { data: e } = await supabase.from("crm_envios").select("*").eq("campanha_id", c.id).order("nome");
    setEnvios((e ?? []) as Envio[]);
    onMudou();
  }

  async function marcar(e: Envio, status: string) {
    const patch: Record<string, unknown> = { status };
    if (status === "enviado" && !e.enviado_em) Object.assign(patch, { enviado_em: new Date().toISOString(), enviado_por: user?.id });
    const { error } = await supabase.from("crm_envios").update(patch).eq("id", e.id);
    if (error) return toast.error(error.message);
    setEnvios((xs) => xs.map((x) => (x.id === e.id ? { ...x, ...patch } as Envio : x)));
  }

  function enviar(c: Campanha, e: Envio) {
    const texto = montarMensagem(c.mensagem, { nome: e.nome, produtos: prods(c.produtos) });
    if (e.destino.startsWith("grupo:")) {
      const lista = listas.find((l) => `grupo:${l.id}` === e.destino);
      navigator.clipboard?.writeText(texto).then(() => toast.success("Mensagem copiada. Cole no grupo que vai abrir."));
      if (lista?.link_grupo) window.open(lista.link_grupo, "_blank");
    } else {
      window.open(linkWhatsApp(e.destino, texto), "_blank");
    }
    marcar(e, "enviado");
  }

  const filtrados = produtos.filter((p) => !buscaProd || p.titulo.toLowerCase().includes(buscaProd.toLowerCase())).slice(0, 30);

  return (
    <div className="space-y-3">
      <Button onClick={() => setNova((v) => !v)}><Plus /> Nova campanha</Button>
      {nova && (
        <Card className="p-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div><Label className="text-xs">Nome da campanha</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ofertas air fryer novembro" /></div>
            <div>
              <Label className="text-xs">Para quem</Label>
              <select value={listaId} onChange={(e) => setListaId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">Escolha a lista ou grupo…</option>
                {listas.map((l) => <option key={l.id} value={l.id}>{l.tipo === "grupo_whatsapp" ? "Grupo: " : "Lista: "}{l.nome}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Mensagem: use {"{primeiro_nome}"}, {"{nome}"} e {"{produtos}"}</Label>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={5} className="w-full rounded-md border bg-background p-2 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Produtos em destaque ({prodSel.length})</Label>
            <Input value={buscaProd} onChange={(e) => setBuscaProd(e.target.value)} placeholder="Buscar produto em estoque…" />
            <div className="max-h-40 overflow-y-auto rounded border divide-y text-sm">
              {filtrados.map((p) => (
                <label key={p.id} className="flex items-center gap-2 p-1.5">
                  <input type="checkbox" className="size-4 accent-primary" checked={prodSel.includes(p.id)} onChange={(e) => setProdSel((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                  <span className="flex-1 truncate">{p.titulo}</span><span>{fmtBRL(Number(p.preco_venda))}</span>
                </label>
              ))}
            </div>
          </div>
          <Card className="p-3 bg-muted/40 text-sm whitespace-pre-wrap"><div className="text-xs text-muted-foreground mb-1">Prévia</div>{montarMensagem(mensagem, { nome: "Maria Silva", produtos: prods(prodSel) })}</Card>
          <Button onClick={criar}>Criar campanha</Button>
        </Card>
      )}

      {!campanhas ? <Loader2 className="animate-spin text-muted-foreground" /> : campanhas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p> : campanhas.map((c) => {
        const enviados = aberta === c.id ? envios.filter((e) => e.status !== "pendente").length : 0;
        return (
          <Card key={c.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <MessageCircle className="size-4" />
              <b>{c.nome}</b>
              <Badge variant="outline">{c.status === "rascunho" ? "Rascunho" : c.status === "enviando" ? "Enviando" : "Concluída"}</Badge>
              <span className="text-xs text-muted-foreground">{listas.find((l) => l.id === c.lista_id)?.nome ?? "sem lista"} · {fmtDate(c.created_at)}</span>
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => abrir(c)}>{aberta === c.id ? "Fechar" : "Abrir envios"}</Button>
            </div>
            {aberta === c.id && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => preparar(c)}><Send /> Preparar envios da lista</Button>
                  {envios.length > 0 && <span className="text-sm">{enviados}/{envios.length} enviados</span>}
                  {envios.length > 0 && c.status !== "concluida" && (
                    <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("crm_campanhas").update({ status: "concluida" }).eq("id", c.id); onMudou(); }}><CheckCheck /> Marcar concluída</Button>
                  )}
                </div>
                {envios.length > 0 && (
                  <div className="max-h-96 overflow-y-auto divide-y rounded border text-sm">
                    {envios.map((e) => (
                      <div key={e.id} className="flex flex-wrap items-center gap-2 p-2">
                        <span className="flex-1 min-w-32"><b>{e.nome}</b> <span className="text-xs text-muted-foreground">{e.destino.startsWith("grupo:") ? "grupo" : `+${e.destino}`}</span></span>
                        <Button size="sm" variant={e.status === "pendente" ? "default" : "outline"} onClick={() => enviar(c, e)}>
                          {e.destino.startsWith("grupo:") ? <Copy /> : <MessageCircle />} {e.status === "pendente" ? "Enviar" : "Reenviar"}
                        </Button>
                        <select value={e.status} onChange={(ev) => marcar(e, ev.target.value)} className={cn("h-8 rounded border bg-background px-1 text-xs", e.status === "comprou" && "border-success text-success")}>
                          <option value="pendente">Pendente</option><option value="enviado">Enviado</option><option value="respondeu">Respondeu</option><option value="comprou">Comprou</option><option value="erro">Número com erro</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ listas
function Listas({ listas, contatos, onMudou }: { listas: Lista[]; contatos: Contato[]; onMudou: () => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"lista" | "grupo_whatsapp">("lista");
  const [link, setLink] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [membros, setMembros] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [cidade, setCidade] = useState("");

  async function criar() {
    if (!nome.trim()) return;
    const { error } = await supabase.from("crm_listas").insert({ nome: nome.trim(), tipo, link_grupo: tipo === "grupo_whatsapp" ? link.trim() || null : null });
    if (error) return toast.error(error.message.includes("duplicate") ? "Já existe uma lista com esse nome." : error.message);
    setNome(""); setLink("");
    onMudou();
  }

  async function abrir(l: Lista) {
    if (aberta === l.id) return setAberta(null);
    setAberta(l.id);
    const { data } = await supabase.from("crm_lista_membros").select("pessoa_id").eq("lista_id", l.id);
    setMembros(new Set((data ?? []).map((m) => m.pessoa_id)));
  }

  async function alternar(listaId: string, pessoaId: string) {
    const tem = membros.has(pessoaId);
    const { error } = tem
      ? await supabase.from("crm_lista_membros").delete().eq("lista_id", listaId).eq("pessoa_id", pessoaId)
      : await supabase.from("crm_lista_membros").insert({ lista_id: listaId, pessoa_id: pessoaId });
    if (error) return toast.error(error.message);
    setMembros((s) => { const n = new Set(s); tem ? n.delete(pessoaId) : n.add(pessoaId); return n; });
  }

  async function adicionarFiltrados(listaId: string, ids: string[]) {
    const novos = ids.filter((id) => !membros.has(id));
    if (!novos.length) return;
    const { error } = await supabase.from("crm_lista_membros").insert(novos.map((pessoa_id) => ({ lista_id: listaId, pessoa_id })));
    if (error) return toast.error(error.message);
    setMembros((s) => new Set([...s, ...novos]));
    toast.success(`${novos.length} contatos adicionados.`);
  }

  const cidades = useMemo(() => [...new Set(contatos.map((c) => c.cidade).filter(Boolean))].sort() as string[], [contatos]);
  const filtrados = contatos.filter((c) => (!busca || c.nome.toLowerCase().includes(busca.toLowerCase())) && (!cidade || c.cidade === cidade));

  return (
    <div className="space-y-3">
      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-40"><Label className="text-xs">Nova lista / grupo</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Clientes VIP, Grupo Ofertas Eldorado" /></div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as "lista" | "grupo_whatsapp")} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="lista">Lista de contatos (envio no privado)</option><option value="grupo_whatsapp">Grupo de WhatsApp</option>
        </select>
        {tipo === "grupo_whatsapp" && <div className="flex-1 min-w-48"><Label className="text-xs">Link do grupo</Label><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://chat.whatsapp.com/..." /></div>}
        <Button onClick={criar}><Plus /> Criar</Button>
      </Card>
      {listas.map((l) => (
        <Card key={l.id} className="p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <b>{l.nome}</b><Badge variant="outline">{l.tipo === "grupo_whatsapp" ? "Grupo de WhatsApp" : "Lista"}</Badge>
            {l.link_grupo && <a href={l.link_grupo} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">abrir grupo</a>}
            {l.tipo === "lista" && <Button size="sm" variant="outline" className="ml-auto" onClick={() => abrir(l)}>{aberta === l.id ? "Fechar" : "Escolher contatos"}</Button>}
          </div>
          {aberta === l.id && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente" className="max-w-xs" />
                <select value={cidade} onChange={(e) => setCidade(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">Todas as cidades</option>{cidades.map((c) => <option key={c}>{c}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={() => adicionarFiltrados(l.id, filtrados.map((c) => c.id))}>Adicionar todos os filtrados ({filtrados.length})</Button>
                <span className="text-sm self-center">{membros.size} na lista</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y rounded border text-sm">
                {filtrados.slice(0, 300).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 p-1.5">
                    <input type="checkbox" className="size-4 accent-primary" checked={membros.has(c.id)} onChange={() => alternar(l.id, c.id)} />
                    <span className="flex-1">{c.nome}</span>
                    <span className={cn("text-xs", !(c.celular || c.telefone) && "text-destructive")}>{c.celular || c.telefone || "sem celular"}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ pedidos
function Pedidos({ campanhas, contatos, produtos, lojaId }: { campanhas: Campanha[]; contatos: Contato[]; produtos: Produto[]; lojaId: string | null }) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [f, setF] = useState({ campanha: "", pessoa: "", produto: "", descricao: "", qtd: "1", valor: "" });

  async function carregar() {
    const { data, error } = await supabase.from("crm_pedidos").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) return toast.error(error.message);
    setPedidos((data ?? []) as Pedido[]);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function criar() {
    const prod = produtos.find((p) => p.id === f.produto);
    const descricao = f.descricao.trim() || prod?.titulo || "";
    if (!descricao) return toast.error("Escolha o produto ou descreva o pedido.");
    const { error } = await supabase.from("crm_pedidos").insert({
      loja_id: lojaId, campanha_id: f.campanha || null, pessoa_id: f.pessoa || null, produto_id: f.produto || null, descricao,
      quantidade: lerNumero(f.qtd) ?? 1, valor: f.valor ? lerNumero(f.valor) : prod ? Number(prod.preco_venda) : null,
    });
    if (error) return toast.error(error.message);
    setF({ ...f, produto: "", descricao: "", qtd: "1", valor: "" });
    carregar();
  }

  async function status(p: Pedido, s: string) {
    const { error } = await supabase.from("crm_pedidos").update({ status: s }).eq("id", p.id);
    if (error) return toast.error(error.message);
    carregar();
  }

  const nomeC = (id: string | null) => contatos.find((c) => c.id === id)?.nome ?? "—";
  const nomeCamp = (id: string | null) => campanhas.find((c) => c.id === id)?.nome ?? "—";

  return (
    <div className="space-y-3">
      <Card className="p-4 grid gap-2 sm:grid-cols-6 items-end">
        <div className="sm:col-span-2">
          <Label className="text-xs">Cliente</Label>
          <select value={f.pessoa} onChange={(e) => setF({ ...f, pessoa: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">—</option>{contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Veio da campanha</Label>
          <select value={f.campanha} onChange={(e) => setF({ ...f, campanha: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Nenhuma / espontâneo</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Produto</Label>
          <select value={f.produto} onChange={(e) => setF({ ...f, produto: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Outro (descrever)</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </select>
        </div>
        <div className="sm:col-span-3"><Label className="text-xs">Descrição (se não estiver na lista)</Label><Input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
        <div><Label className="text-xs">Qtd.</Label><Input value={f.qtd} onChange={(e) => setF({ ...f, qtd: e.target.value })} /></div>
        <div><Label className="text-xs">Valor unit.</Label><Input value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="do produto" /></div>
        <Button onClick={criar}><ShoppingBag /> Registrar</Button>
      </Card>
      <Card className="p-4">
        {!pedidos ? <Loader2 className="animate-spin text-muted-foreground" /> : pedidos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pedido registrado.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Quando</th><th className="py-2 pr-2">Cliente</th><th className="py-2 pr-2">Pedido</th><th className="py-2 pr-2 hidden md:table-cell">Campanha</th><th className="py-2 pr-2 text-right">Valor</th><th className="py-2">Situação</th></tr></thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-xs">{fmtDate(p.created_at)}</td>
                    <td className="py-1.5 pr-2">{nomeC(p.pessoa_id)}</td>
                    <td className="py-1.5 pr-2">{Number(p.quantidade)}× {p.descricao}</td>
                    <td className="py-1.5 pr-2 text-xs hidden md:table-cell">{nomeCamp(p.campanha_id)}</td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">{p.valor != null ? fmtBRL(Number(p.valor) * Number(p.quantidade)) : "—"}</td>
                    <td className="py-1.5">
                      <select value={p.status} onChange={(e) => status(p, e.target.value)} className="h-8 rounded border bg-background px-1 text-xs">
                        <option value="novo">Novo</option><option value="separado">Separado</option><option value="vendido">Vendido</option><option value="cancelado">Cancelado</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ métricas
function Metricas() {
  const [m, setM] = useState<Metrica[] | null>(null);
  const [top, setTop] = useState<{ nome: string; valor: number; dica: string }[]>([]);
  useEffect(() => {
    supabase.rpc("crm_metricas").then(({ data, error }) => {
      if (error) return toast.error(error.message);
      setM((data ?? []) as Metrica[]);
    });
    supabase.from("crm_pedidos").select("descricao, quantidade, valor").neq("status", "cancelado").limit(2000).then(({ data }) => {
      const agg = new Map<string, { q: number; v: number }>();
      for (const p of data ?? []) {
        const x = agg.get(p.descricao) ?? { q: 0, v: 0 };
        x.q += Number(p.quantidade);
        x.v += Number(p.valor ?? 0) * Number(p.quantidade);
        agg.set(p.descricao, x);
      }
      setTop([...agg.entries()].sort((a, b) => b[1].q - a[1].q).slice(0, 10).map(([nome, x]) => ({ nome, valor: x.v, dica: `${nome}: ${x.q} pedido(s) · ${fmtBRL(x.v)}` })));
    });
  }, []);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <div className="space-y-3">
      <Card className="p-4">
        {!m ? <Loader2 className="animate-spin text-muted-foreground" /> : m.length === 0 ? <p className="text-sm text-muted-foreground">Sem campanhas.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Campanha</th><th className="py-2 pr-2 text-right">Enviados</th><th className="py-2 pr-2 text-right">Responderam</th><th className="py-2 pr-2 text-right">Compraram</th><th className="py-2 pr-2 text-right">Pedidos</th><th className="py-2 pr-2 text-right">Valor pedido</th></tr></thead>
              <tbody>
                {m.map((x) => (
                  <tr key={x.campanha_id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2"><div className="font-medium">{x.nome}</div><div className="text-xs text-muted-foreground">{fmtDate(x.criada)}</div></td>
                    <td className="py-1.5 pr-2 text-right">{x.enviados}/{x.envios}</td>
                    <td className="py-1.5 pr-2 text-right">{x.responderam} <span className="text-xs text-muted-foreground">({pct(Number(x.responderam), Number(x.enviados))})</span></td>
                    <td className="py-1.5 pr-2 text-right">{x.compraram} <span className="text-xs text-muted-foreground">({pct(Number(x.compraram), Number(x.enviados))})</span></td>
                    <td className="py-1.5 pr-2 text-right">{x.pedidos}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold">{fmtBRL(Number(x.valor_pedidos))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Barras titulo="Produtos mais pedidos pelo WhatsApp (valor)" dados={top} />
    </div>
  );
}
