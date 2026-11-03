// Janela de permissões de um usuário (só o admin edita):
// empresas, modelo pronto, áreas (ver/inserir/editar/excluir) e ações especiais.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Copy, Loader2, Save, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/lib/loja";
import {
  ACOES_ESPECIAIS, MODELOS, MODULOS, acoesLiberadas, mapaLiberado,
  type Acao, type ChaveAcao, type LinhaPermissao, type MapaAcoes, type MapaModulos, type Modulo,
} from "@/lib/permissoes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const ACOES: { id: Acao; nome: string }[] = [
  { id: "ver", nome: "Ver" }, { id: "inserir", nome: "Inserir" }, { id: "editar", nome: "Editar" }, { id: "excluir", nome: "Excluir" },
];

interface Snapshot { modulos: MapaModulos; acoes: MapaAcoes; lojas: string[] }

async function lerPermissoes(userId: string): Promise<Snapshot> {
  const [a, b, c] = await Promise.all([
    supabase.from("permissoes").select("modulo, ver, inserir, editar, excluir").eq("user_id", userId),
    supabase.from("permissoes_acoes").select("chave, permitido").eq("user_id", userId),
    supabase.from("usuario_lojas").select("loja_id").eq("user_id", userId),
  ]);
  const modulos = mapaLiberado();
  for (const l of (a.data ?? []) as LinhaPermissao[]) modulos[l.modulo] = l;
  const acoes = acoesLiberadas();
  for (const f of (b.data ?? []) as { chave: ChaveAcao; permitido: boolean }[]) acoes[f.chave] = f.permitido;
  return { modulos, acoes, lojas: (c.data ?? []).map((x) => x.loja_id as string) };
}

/** Regras para não deixar o usuário "quebrado". */
function corrigir(m: MapaModulos): { m: MapaModulos; avisos: string[] } {
  const avisos: string[] = [];
  const x = structuredClone(m);
  for (const k of Object.keys(x) as Modulo[]) {
    const l = x[k];
    if (!l.ver && (l.inserir || l.editar || l.excluir)) l.ver = true;
  }
  if (x.vendas.inserir && !x.produtos.ver) { x.produtos.ver = true; avisos.push("Para vender, ele precisa ver os produtos: marquei Produtos → Ver."); }
  if (x.vendas.inserir && !x.caixa.inserir) avisos.push("Ele vende mas não pode abrir caixa: alguém terá que abrir o caixa para ele.");
  return { m: x, avisos };
}

export function PermissoesDialog({ userId, nome, papel, outros, onClose, onSalvo }: {
  userId: string; nome: string; papel: string | null;
  outros: { id: string; nome: string }[]; onClose: () => void; onSalvo?: () => void;
}) {
  const { lojas } = useLoja();
  const [original, setOriginal] = useState<Snapshot | null>(null);
  const [atual, setAtual] = useState<Snapshot | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const admin = papel === "admin";

  useEffect(() => {
    lerPermissoes(userId).then((s) => { setOriginal(s); setAtual(structuredClone(s)); });
  }, [userId]);

  const mudou = useMemo(() => JSON.stringify(original) !== JSON.stringify(atual), [original, atual]);
  const contagem = useMemo(() => {
    if (!atual) return { on: 0, total: 0 };
    const vals = [...Object.values(atual.modulos).flatMap((l) => [l.ver, l.inserir, l.editar, l.excluir]), ...Object.values(atual.acoes)];
    return { on: vals.filter(Boolean).length, total: vals.length };
  }, [atual]);

  function setModulos(fn: (m: MapaModulos) => void) {
    setAtual((s) => {
      if (!s) return s;
      const m = structuredClone(s.modulos);
      fn(m);
      const r = corrigir(m);
      setAvisos(r.avisos);
      return { ...s, modulos: r.m };
    });
  }
  function alternar(mod: Modulo, a: Acao, v: boolean) {
    setModulos((m) => {
      m[mod][a] = v;
      if (a === "ver" && !v) Object.assign(m[mod], { inserir: false, editar: false, excluir: false });
    });
  }
  const linhaToda = (mod: Modulo, v: boolean) => setModulos((m) => { Object.assign(m[mod], { ver: v, inserir: v, editar: v, excluir: v }); });
  const colunaToda = (a: Acao, v: boolean) => setModulos((m) => {
    for (const k of Object.keys(m) as Modulo[]) { m[k][a] = v; if (a === "ver" && !v) Object.assign(m[k], { inserir: false, editar: false, excluir: false }); }
  });
  const flag = (c: ChaveAcao, v: boolean) => setAtual((s) => (s ? { ...s, acoes: { ...s.acoes, [c]: v } } : s));
  const loja = (id: string, v: boolean) => setAtual((s) => (s ? { ...s, lojas: v ? [...s.lojas, id] : s.lojas.filter((x) => x !== id) } : s));

  function aplicarModelo(id: string) {
    const md = MODELOS.find((x) => x.id === id)!;
    setAtual((s) => (s ? { ...s, modulos: structuredClone(md.modulos), acoes: { ...md.acoes } } : s));
    setAvisos([]);
    toast.info(`Modelo "${md.nome}" aplicado. Ajuste se quiser e clique em Salvar.`);
  }
  async function copiarDe(outroId: string) {
    if (!outroId) return;
    const s = await lerPermissoes(outroId);
    setAtual((a) => (a ? { ...a, modulos: s.modulos, acoes: s.acoes } : a));
    toast.info(`Permissões copiadas de ${outros.find((o) => o.id === outroId)?.nome}. Clique em Salvar para gravar.`);
  }

  async function salvar() {
    if (!atual || !original) return;
    if (atual.lojas.length === 0 && !admin) return toast.error("Marque pelo menos uma empresa em que ele trabalha.");
    setSalvando(true);
    const agora = new Date().toISOString();
    const erros: string[] = [];
    const r1 = await supabase.from("permissoes").upsert(Object.values(atual.modulos).map((l) => ({ ...l, user_id: userId, updated_at: agora })));
    if (r1.error) erros.push(r1.error.message);
    const r2 = await supabase.from("permissoes_acoes").upsert(Object.entries(atual.acoes).map(([chave, permitido]) => ({ user_id: userId, chave, permitido, updated_at: agora })));
    if (r2.error) erros.push(r2.error.message);
    const novas = atual.lojas.filter((x) => !original.lojas.includes(x));
    const tiradas = original.lojas.filter((x) => !atual.lojas.includes(x));
    if (novas.length) { const r = await supabase.from("usuario_lojas").insert(novas.map((loja_id) => ({ user_id: userId, loja_id }))); if (r.error) erros.push(r.error.message); }
    if (tiradas.length) { const r = await supabase.from("usuario_lojas").delete().eq("user_id", userId).in("loja_id", tiradas); if (r.error) erros.push(r.error.message); }
    setSalvando(false);
    if (erros.length) return toast.error(erros.join(" · "));
    toast.success(`Permissões de ${nome} salvas. Valem no próximo acesso dele(a) ou ao apertar F5.`);
    setOriginal(structuredClone(atual));
    onSalvo?.();
  }

  function fechar() {
    if (mudou && !salvando) {
      toast.warning("Há alterações não salvas. Clique em Salvar ou em Descartar.");
      return;
    }
    onClose();
  }

  const grupos = [...new Set(MODULOS.map((m) => m.grupo))];
  const gruposAcoes = [...new Set(ACOES_ESPECIAIS.map((a) => a.grupo))];

  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[94vh] overflow-hidden p-0 sm:max-w-4xl flex flex-col gap-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Permissões de {nome}</DialogTitle>
          <DialogDescription>
            {admin ? "Este usuário é Admin: pode tudo, em todas as empresas." : <>Marque o que ele <b>pode</b> fazer. O que estiver desligado o sistema bloqueia, inclusive no banco de dados. <span className="whitespace-nowrap">{contagem.on} de {contagem.total} liberados.</span></>}
          </DialogDescription>
        </DialogHeader>

        {!atual ? <div className="p-10 grid place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div> : admin ? (
          <div className="p-6 text-sm text-muted-foreground">Para limitar este usuário, mude o perfil dele para Gerente, Vendedor ou Estoquista no cadastro (botão "Cadastro").</div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Empresas */}
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4 text-primary" /> Empresas em que trabalha</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {lojas.map((l) => (
                  <label key={l.id} className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition-colors", atual.lojas.includes(l.id) ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                    <span className="font-medium text-sm">{l.nome}</span>
                    <Switch checked={atual.lojas.includes(l.id)} onChange={(v) => loja(l.id, v)} label={l.nome} />
                  </label>
                ))}
              </div>
              {atual.lojas.length > 1 && <p className="text-xs text-muted-foreground">Com mais de uma empresa, ele escolhe em qual vai trabalhar ao entrar no sistema.</p>}
            </section>

            {/* Modelos */}
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Começar de um modelo</h3>
                {outros.length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Copy className="size-3.5" /> Copiar de
                    <select defaultValue="" onChange={(e) => { copiarDe(e.target.value); e.target.value = ""; }} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground">
                      <option value="">escolha um usuário…</option>
                      {outros.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {MODELOS.map((md) => (
                  <button key={md.id} type="button" onClick={() => aplicarModelo(md.id)} title={md.desc}
                    className="rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:border-primary hover:bg-primary/5">
                    <div className="font-semibold text-sm">{md.nome}</div>
                    <div className="text-muted-foreground">{md.desc}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Áreas */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">O que ele pode fazer em cada área</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm [&_td]:!bg-transparent">
                  <thead>
                    <tr className="bg-muted/60 text-xs text-muted-foreground">
                      <th className="p-2.5 text-left font-semibold">Área</th>
                      {ACOES.map((a) => {
                        const todos = Object.values(atual.modulos).every((l) => l[a.id]);
                        return (
                          <th key={a.id} className="p-2.5 text-center font-semibold">
                            <div className="flex flex-col items-center gap-1">
                              <span className="uppercase tracking-wide">{a.nome}</span>
                              <button type="button" onClick={() => colunaToda(a.id, !todos)} className="text-[10px] font-normal normal-case text-primary hover:underline">{todos ? "desmarcar" : "marcar"} todos</button>
                            </div>
                          </th>
                        );
                      })}
                      <th className="p-2.5 text-center font-semibold text-[10px] uppercase">Tudo</th>
                    </tr>
                  </thead>
                  {grupos.map((g) => (
                    <tbody key={g}>
                      <tr><td colSpan={6} className="border-t bg-muted/30 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</td></tr>
                      {MODULOS.filter((m) => m.grupo === g).map((m) => {
                        const l = atual.modulos[m.id];
                        const tudo = l.ver && l.inserir && l.editar && l.excluir;
                        const nada = !l.ver;
                        return (
                          <tr key={m.id} className={cn("border-t", nada && "opacity-60")}>
                            <td className="p-2.5">
                              <div className="font-medium">{m.nome}</div>
                              <div className="text-xs text-muted-foreground">{nada ? "sem acesso: some do menu" : m.desc}</div>
                            </td>
                            {ACOES.map((a) => (
                              <td key={a.id} className="p-2.5 text-center">
                                <div className="flex justify-center"><Switch size="sm" checked={l[a.id]} onChange={(v) => alternar(m.id, a.id, v)} label={`${a.nome} ${m.nome}`} /></div>
                              </td>
                            ))}
                            <td className="p-2.5 text-center">
                              <button type="button" onClick={() => linhaToda(m.id, !tudo)} className={cn("rounded px-2 py-0.5 text-[11px] font-medium", tudo ? "bg-primary/10 text-primary" : "border text-muted-foreground hover:bg-muted")}>{tudo ? "tudo ✓" : "liberar"}</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
              {avisos.map((a) => <p key={a} className="flex items-start gap-1.5 rounded-md bg-warning/15 p-2 text-xs"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> {a}</p>)}
            </section>

            {/* Ações especiais */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Ações especiais</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {gruposAcoes.map((g) => (
                  <div key={g} className="rounded-lg border">
                    <div className="border-b bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</div>
                    {ACOES_ESPECIAIS.filter((a) => a.grupo === g).map((a) => (
                      <label key={a.id} className="flex cursor-pointer items-center justify-between gap-3 border-b px-3 py-2.5 last:border-0 hover:bg-muted/30">
                        <div>
                          <div className="flex items-center gap-1.5 text-sm font-medium">{a.nome}{a.risco && <span className="rounded bg-warning/20 px-1 text-[10px] font-semibold uppercase">sensível</span>}</div>
                          <div className="text-xs text-muted-foreground">{a.desc}</div>
                        </div>
                        <Switch checked={atual.acoes[a.id]} onChange={(v) => flag(a.id, v)} label={a.nome} />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {atual && !admin && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-5 py-3">
            <span className={cn("text-xs", mudou ? "font-medium text-warning-foreground" : "text-muted-foreground")}>{mudou ? "● Alterações não salvas" : "Tudo salvo"}</span>
            <div className="flex gap-2">
              {mudou && <Button type="button" variant="ghost" onClick={() => { setAtual(structuredClone(original!)); setAvisos([]); }}>Descartar</Button>}
              <Button type="button" variant="outline" onClick={() => (mudou ? fechar() : onClose())}>Fechar</Button>
              <Button type="button" onClick={salvar} disabled={salvando || !mudou}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar permissões</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
