// Editor de post (imagem + legenda) e diálogo de compartilhar um produto, como no PrecificaLote.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, ImagePlus, Loader2, Palette, Plus, Save, Share2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  CAMPOS, camadaNoPonto, carregarImagens, chaveLayout, compartilharPost, desenharPost, EXEMPLO_POST, excluirLayout, gerarImagemPost,
  guardarLayoutPreferido, layoutPreferido, layoutsProntos, listarLayouts, novaCamadaTexto, preencherCampos, reduzirLogo, salvarLayout,
  type Camada, type DadosPost, type Imagens, type LayoutPost,
} from "@/lib/post";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const copiar = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Item de lote → dados do post. */
export function dadosDoItem(i: { titulo: string; preco_ml: number | null; preco_venda: number | null; quantidade: number; foto_url: string | null }): DadosPost {
  return { nome: i.titulo, precoML: i.preco_ml, precoVenda: i.preco_venda, qtd: i.quantidade, foto: i.foto_url };
}

/** Layouts prontos + os salvos da loja. */
function useLayouts(lojaId: string) {
  const [salvos, setSalvos] = useState<LayoutPost[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  async function recarregar() {
    try {
      setSalvos(await listarLayouts(lojaId));
      setErro(null);
    } catch (e) {
      setSalvos([]);
      setErro((e as Error).message);
    }
  }
  useEffect(() => { recarregar(); }, [lojaId]);
  const todos = useMemo(() => [...(salvos ?? []), ...layoutsProntos()], [salvos]);
  return { salvos, todos, erro, recarregar };
}

/** Canvas do post, escalado pelo CSS. */
function PreviaPost({ layout, dados, selecionada, onSelecionar, onMover, className }: {
  layout: LayoutPost; dados: DadosPost; selecionada?: string | null;
  onSelecionar?: (id: string | null) => void; onMover?: (id: string, x: number, y: number) => void; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [imgs, setImgs] = useState<Imagens | null>(null);
  const arrasto = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const chaveImgs = `${dados.foto}|${layout.camadas.filter((c) => c.tipo === "logo").map((c) => `${c.id}:${(c.imagem ?? "").length}`).join(",")}`;
  useEffect(() => {
    let vivo = true;
    carregarImagens(layout, dados).then((r) => vivo && setImgs(r));
    return () => { vivo = false; };
  }, [chaveImgs]);
  useEffect(() => {
    if (ref.current && imgs) desenharPost(ref.current, layout, dados, imgs, selecionada);
  }, [layout, dados, imgs, selecionada]);

  const pct = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  return (
    <canvas
      ref={ref}
      className={cn("aspect-[4/5] w-full rounded-md border bg-muted shadow-sm", onSelecionar && "cursor-pointer touch-none", className)}
      onPointerDown={(e) => {
        if (!onSelecionar) return;
        const p = pct(e);
        const c = camadaNoPonto(layout, p.x, p.y);
        const alvo = c;
        onSelecionar(alvo?.id ?? null);
        if (alvo && alvo.tipo !== "fundo" && onMover) {
          arrasto.current = { id: alvo.id, dx: p.x - alvo.x, dy: p.y - alvo.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        if (!arrasto.current || !onMover) return;
        const p = pct(e);
        onMover(arrasto.current.id, Math.round((p.x - arrasto.current.dx) * 2) / 2, Math.round((p.y - arrasto.current.dy) * 2) / 2);
      }}
      onPointerUp={() => { arrasto.current = null; }}
    />
  );
}

// ====================================================================== EDITOR
export function EditorPostDialog({ lojaId, loteId, onClose }: { lojaId: string; loteId?: string; onClose: () => void }) {
  const { role } = useAuth();
  const gestor = role === "admin" || role === "gerente";
  const { salvos, todos, erro, recarregar } = useLayouts(lojaId);
  const [layout, setLayout] = useState<LayoutPost | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [aba, setAba] = useState<"camadas" | "legenda">("camadas");
  const [salvando, setSalvando] = useState(false);
  const [produtos, setProdutos] = useState<DadosPost[]>([]);
  const [prodIdx, setProdIdx] = useState(-1);
  const dados = prodIdx >= 0 ? produtos[prodIdx] : EXEMPLO_POST;

  // começa no layout preferido (ou no primeiro)
  useEffect(() => {
    if (salvos == null || layout) return;
    const pref = layoutPreferido(lojaId);
    setLayout(copiar(todos.find((l) => chaveLayout(l) === pref) ?? todos[0]));
  }, [salvos]);

  // produtos do lote para ver a prévia com dados reais
  useEffect(() => {
    if (!loteId) return;
    supabase.from("lote_itens").select("titulo, preco_ml, preco_venda, quantidade, foto_url").eq("lote_id", loteId)
      .not("foto_url", "is", null).not("preco_venda", "is", null).order("created_at", { ascending: false }).limit(40)
      .then(({ data }) => {
        const ps = (data ?? []).map(dadosDoItem);
        setProdutos(ps);
        if (ps.length) setProdIdx(0);
      });
  }, [loteId]);

  function mudar(patch: Partial<LayoutPost>) {
    setLayout((l) => (l ? { ...l, ...patch } : l));
  }
  function mudarCamada(id: string, patch: Partial<Camada>) {
    setLayout((l) => (l ? { ...l, camadas: l.camadas.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : l));
  }
  function moverOrdem(id: string, dir: -1 | 1) {
    setLayout((l) => {
      if (!l) return l;
      const cs = [...l.camadas];
      const i = cs.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 1 || j >= cs.length) return l; // o fundo fica sempre embaixo (posição 0)
      [cs[i], cs[j]] = [cs[j], cs[i]];
      return { ...l, camadas: cs };
    });
  }
  function removerCamada(id: string) {
    setLayout((l) => (l ? { ...l, camadas: l.camadas.filter((c) => c.id !== id) } : l));
    setSel(null);
  }
  function adicionarTexto() {
    const c = novaCamadaTexto();
    setLayout((l) => (l ? { ...l, camadas: [...l.camadas, c] } : l));
    setSel(c.id);
    setAba("camadas");
  }

  async function salvar() {
    if (!layout) return;
    let alvo = layout;
    if (!layout.id) {
      // layout pronto: salva uma cópia da loja com outro nome
      const pronto = layoutsProntos().some((l) => l.nome === layout.nome);
      const nome = window.prompt("Nome do layout da loja:", pronto ? `${layout.nome} (loja)` : layout.nome)?.trim();
      if (!nome) return;
      alvo = { ...layout, nome };
    }
    setSalvando(true);
    try {
      const id = await salvarLayout(lojaId, alvo);
      const novo = { ...alvo, id };
      setLayout(novo);
      guardarLayoutPreferido(lojaId, id);
      await recarregar();
      toast.success(`Layout "${novo.nome}" salvo.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!layout?.id) return;
    if (!window.confirm(`Excluir o layout "${layout.nome}"?`)) return;
    try {
      await excluirLayout(layout.id);
      toast.success("Layout excluído.");
      await recarregar();
      setLayout(copiar(layoutsProntos()[0]));
      setSel(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function escolherLayout(chave: string) {
    const l = todos.find((x) => chaveLayout(x) === chave);
    if (!l) return;
    setLayout(copiar(l));
    setSel(null);
    guardarLayoutPreferido(lojaId, chave);
  }

  async function testar() {
    if (!layout) return;
    try {
      const blob = await gerarImagemPost(layout, dados);
      const r = await compartilharPost(blob, preencherCampos(layout.legenda, dados), dados.nome);
      if (r === "baixado") toast.success("Imagem baixada e legenda copiada.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const camada = layout?.camadas.find((c) => c.id === sel) ?? null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[95vh] max-w-6xl overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ImagePlus className="size-5" /> Editor de post</DialogTitle>
          <DialogDescription>Monte a arte que vai para o WhatsApp e as redes. Clique numa camada da arte para editar e arraste para mudar de lugar.</DialogDescription>
        </DialogHeader>
        {erro && <p className="rounded border border-warning bg-warning/10 p-2 text-sm">Não foi possível ler os layouts salvos ({erro}). Os layouts prontos continuam funcionando.</p>}
        {!layout ? (
          <Loader2 className="animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-3">
            {/* barra do layout */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Label className="text-xs">Layout</Label>
                <select value={chaveLayout(layout)} onChange={(e) => escolherLayout(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  {(salvos ?? []).length > 0 && <optgroup label="Da loja">{salvos!.map((l) => <option key={chaveLayout(l)} value={chaveLayout(l)}>{l.nome}</option>)}</optgroup>}
                  <optgroup label="Prontos">{layoutsProntos().map((l) => <option key={chaveLayout(l)} value={chaveLayout(l)}>{l.nome}</option>)}</optgroup>
                </select>
              </div>
              {layout.id && (
                <div className="min-w-40 flex-1">
                  <Label className="text-xs">Nome</Label>
                  <Input value={layout.nome} onChange={(e) => mudar({ nome: e.target.value })} />
                </div>
              )}
              <Button variant="outline" onClick={() => { setLayout({ ...copiar(layout), id: null, nome: `${layout.nome} (cópia)` }); }} title="Usar este como base de um layout novo">
                <Copy /> Novo a partir deste
              </Button>
              {layout.id && gestor && <Button variant="outline" className="text-destructive" onClick={excluir}><Trash2 /> Excluir</Button>}
              <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar</Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
              {/* esquerda: camadas / legenda */}
              <div className="space-y-2">
                <div className="flex gap-1 border-b pb-1">
                  <Button size="sm" variant={aba === "camadas" ? "default" : "ghost"} onClick={() => setAba("camadas")}>Camadas</Button>
                  <Button size="sm" variant={aba === "legenda" ? "default" : "ghost"} onClick={() => setAba("legenda")}>Legenda</Button>
                </div>
                {aba === "camadas" ? (
                  <div className="space-y-1">
                    <Button size="sm" variant="outline" className="w-full" onClick={adicionarTexto}><Plus /> Texto</Button>
                    {[...layout.camadas].reverse().map((c) => (
                      <div key={c.id} className={cn("flex items-center gap-1 rounded border px-1 py-1 text-sm", sel === c.id && "border-primary bg-primary/10")}>
                        <button className="min-w-0 flex-1 truncate text-left" onClick={() => setSel(c.id)}>
                          <span className="mr-1 text-xs text-muted-foreground">{c.tipo === "texto" ? "T" : c.tipo === "foto" ? "🖼" : c.tipo === "logo" ? "🏷" : "🎨"}</span>
                          {c.tipo === "texto" ? (c.texto || c.nome) : c.nome}
                        </button>
                        {c.tipo !== "fundo" && (
                          <>
                            <button title="Subir" onClick={() => moverOrdem(c.id, 1)} className="text-muted-foreground hover:text-foreground"><ArrowUp className="size-3.5" /></button>
                            <button title="Descer" onClick={() => moverOrdem(c.id, -1)} className="text-muted-foreground hover:text-foreground"><ArrowDown className="size-3.5" /></button>
                          </>
                        )}
                        <button title={c.visivel ? "Esconder" : "Mostrar"} onClick={() => mudarCamada(c.id, { visivel: !c.visivel })} className="text-muted-foreground hover:text-foreground">
                          {c.visivel ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea value={layout.legenda} onChange={(e) => mudar({ legenda: e.target.value })} rows={8} className="w-full rounded-md border bg-background p-2 text-sm" />
                    <BotoesCampos onInserir={(campo) => mudar({ legenda: layout.legenda + campo })} />
                    <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-sm">{preencherCampos(layout.legenda, dados)}</div>
                  </div>
                )}
              </div>

              {/* centro: prévia */}
              <div className="mx-auto w-full max-w-[420px] space-y-2">
                <PreviaPost
                  layout={layout}
                  dados={dados}
                  selecionada={sel}
                  onSelecionar={setSel}
                  onMover={(id, x, y) => mudarCamada(id, { x, y })}
                />
                {produtos.length > 0 && (
                  <select value={prodIdx} onChange={(e) => setProdIdx(Number(e.target.value))} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value={-1}>Produto de exemplo</option>
                    {produtos.map((p, i) => <option key={i} value={i}>{p.nome}</option>)}
                  </select>
                )}
                <Button variant="outline" className="w-full" onClick={testar}><Share2 /> Testar compartilhamento</Button>
              </div>

              {/* direita: propriedades */}
              <div className="space-y-3 text-sm">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Propriedades</div>
                {!camada ? (
                  <p className="text-muted-foreground">Clique em uma camada (na arte ou na lista) para editar.</p>
                ) : (
                  <Propriedades
                    camada={camada}
                    onMudar={(p) => mudarCamada(camada.id, p)}
                    onRemover={camada.tipo === "texto" ? () => removerCamada(camada.id) : undefined}
                  />
                )}
              </div>
            </div>
            {!layout.id && <p className="text-xs text-muted-foreground">Este é um layout pronto. Ao clicar em Salvar, ele vira um layout da loja com o nome que você escolher.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BotoesCampos({ onInserir }: { onInserir: (campo: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {CAMPOS.map((c) => (
        <button key={c.campo} onClick={() => onInserir(c.campo)} className="rounded-full border border-primary/40 px-2 py-0.5 text-xs text-primary hover:bg-primary/10">
          + {c.rotulo}
        </button>
      ))}
    </div>
  );
}

function Num({ label, valor, onMudar, min = 0, max = 100, step = 0.5 }: { label: string; valor: number; onMudar: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={valor} min={min} max={max} step={step} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onMudar(Math.min(max, Math.max(min, v))); }} />
    </div>
  );
}

function Cor({ label, valor, onMudar }: { label: string; valor: string; onMudar: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={valor} onChange={(e) => onMudar(e.target.value)} className="h-9 w-10 cursor-pointer rounded border bg-background" />
        <span className="font-mono text-xs">{valor}</span>
      </div>
    </div>
  );
}

function Propriedades({ camada: c, onMudar, onRemover }: { camada: Camada; onMudar: (p: Partial<Camada>) => void; onRemover?: () => void }) {
  const inputLogo = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium capitalize">{c.tipo === "texto" ? "Texto" : c.nome}</div>
        {onRemover && <Button size="sm" variant="outline" className="text-destructive" onClick={onRemover}><Trash2 /> Deletar</Button>}
      </div>

      {c.tipo === "fundo" && <Cor label="Cor do fundo" valor={c.corFundo ?? "#2d5a27"} onMudar={(v) => onMudar({ corFundo: v })} />}

      {c.tipo === "logo" && (
        <div className="space-y-2">
          {c.imagem && <img src={c.imagem} alt="logo" className="max-h-20 rounded border bg-muted object-contain p-1" />}
          <input
            ref={inputLogo} type="file" accept="image/*" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try { onMudar({ imagem: await reduzirLogo(f) }); } catch (err) { toast.error((err as Error).message); }
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => inputLogo.current?.click()}><Upload /> {c.imagem ? "Trocar logo" : "Enviar logo"}</Button>
            {c.imagem && <Button size="sm" variant="ghost" onClick={() => onMudar({ imagem: null })}>Tirar</Button>}
          </div>
          <p className="text-xs text-muted-foreground">PNG com fundo transparente fica melhor.</p>
        </div>
      )}

      {c.tipo === "foto" && (
        <>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!c.fundoBranco} onChange={(e) => onMudar({ fundoBranco: e.target.checked })} /> Fundo branco atrás da foto</label>
          <Num label="Arredondamento" valor={c.raio ?? 0} onMudar={(v) => onMudar({ raio: v })} max={200} step={2} />
        </>
      )}

      {c.tipo === "texto" && (
        <>
          <div>
            <Label className="text-xs">Texto</Label>
            <textarea value={c.texto ?? ""} onChange={(e) => onMudar({ texto: e.target.value })} rows={2} className="w-full rounded-md border bg-background p-2 text-sm" />
            <BotoesCampos onInserir={(campo) => onMudar({ texto: (c.texto ?? "") + campo })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Cor label="Cor" valor={c.cor ?? "#ffffff"} onMudar={(v) => onMudar({ cor: v })} />
            <Num label="Tamanho" valor={c.tamanho ?? 40} onMudar={(v) => onMudar({ tamanho: v })} min={12} max={200} step={2} />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!c.negrito} onChange={(e) => onMudar({ negrito: e.target.checked })} /> Negrito</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!c.italico} onChange={(e) => onMudar({ italico: e.target.checked })} /> Itálico</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!c.riscado} onChange={(e) => onMudar({ riscado: e.target.checked })} /> Riscado</label>
          </div>
          <div>
            <Label className="text-xs">Alinhamento</Label>
            <select value={c.alinhamento ?? "center"} onChange={(e) => onMudar({ alinhamento: e.target.value as Camada["alinhamento"] })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="left">Esquerda</option>
              <option value="center">Centro</option>
              <option value="right">Direita</option>
            </select>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!c.fundo} onChange={(e) => onMudar({ fundo: e.target.checked })} /> <Palette className="size-4" /> Faixa de fundo</label>
          {c.fundo && (
            <div className="grid grid-cols-2 gap-2">
              <Cor label="Cor da faixa" valor={c.corFundo ?? "#000000"} onMudar={(v) => onMudar({ corFundo: v })} />
              <Num label="Arredondamento" valor={c.raio ?? 0} onMudar={(v) => onMudar({ raio: v })} max={200} step={2} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Num label="Margem lateral" valor={c.padH ?? 16} onMudar={(v) => onMudar({ padH: v })} max={200} step={2} />
            <Num label="Margem vertical" valor={c.padV ?? 8} onMudar={(v) => onMudar({ padV: v })} max={200} step={2} />
          </div>
        </>
      )}

      {c.tipo !== "fundo" && (
        <div>
          <div className="mb-1 text-xs font-semibold text-muted-foreground">Posição e tamanho (%)</div>
          <div className="grid grid-cols-2 gap-2">
            <Num label="X" valor={c.x} onMudar={(v) => onMudar({ x: v })} min={-50} />
            <Num label="Y" valor={c.y} onMudar={(v) => onMudar({ y: v })} min={-50} />
            <Num label="Largura" valor={c.w} onMudar={(v) => onMudar({ w: v })} min={1} max={150} />
            <Num label="Altura" valor={c.h} onMudar={(v) => onMudar({ h: v })} min={1} max={150} />
          </div>
        </div>
      )}
    </div>
  );
}

// ====================================================================== COMPARTILHAR UM PRODUTO
export function CompartilharPostDialog({ lojaId, loteId, dados, onClose }: { lojaId: string; loteId?: string; dados: DadosPost; onClose: () => void }) {
  const { salvos, todos, recarregar } = useLayouts(lojaId);
  const [chave, setChave] = useState<string | null>(null);
  const [legenda, setLegenda] = useState("");
  const [gerando, setGerando] = useState(false);
  const [editor, setEditor] = useState(false);
  const layout = todos.find((l) => chaveLayout(l) === chave) ?? null;

  useEffect(() => {
    if (salvos == null) return;
    const pref = layoutPreferido(lojaId);
    const l = todos.find((x) => chaveLayout(x) === (chave ?? pref)) ?? todos[0];
    setChave(chaveLayout(l));
    setLegenda(preencherCampos(l.legenda, dados));
  }, [salvos]);

  function escolher(k: string) {
    const l = todos.find((x) => chaveLayout(x) === k);
    if (!l) return;
    setChave(k);
    setLegenda(preencherCampos(l.legenda, dados));
    guardarLayoutPreferido(lojaId, k);
  }

  async function enviar() {
    if (!layout) return;
    setGerando(true);
    try {
      const blob = await gerarImagemPost(layout, dados);
      const r = await compartilharPost(blob, legenda, dados.nome);
      if (r === "baixado") toast.success("Imagem baixada e legenda copiada. Cole a legenda junto da imagem no WhatsApp.");
      if (r === "compartilhado") toast.success("Post compartilhado. A legenda também ficou copiada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  async function copiarLegenda() {
    try {
      await navigator.clipboard.writeText(legenda);
      toast.success("Legenda copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  if (editor) return <EditorPostDialog lojaId={lojaId} loteId={loteId} onClose={() => { setEditor(false); recarregar(); }} />;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[95vh] max-w-3xl overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="size-5" /> Compartilhar produto</DialogTitle>
          <DialogDescription className="line-clamp-1">{dados.nome}</DialogDescription>
        </DialogHeader>
        {!layout ? (
          <Loader2 className="animate-spin text-muted-foreground" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <PreviaPost layout={layout} dados={dados} />
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Layout</Label>
                <select value={chave ?? ""} onChange={(e) => escolher(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  {(salvos ?? []).length > 0 && <optgroup label="Da loja">{salvos!.map((l) => <option key={chaveLayout(l)} value={chaveLayout(l)}>{l.nome}</option>)}</optgroup>}
                  <optgroup label="Prontos">{layoutsProntos().map((l) => <option key={chaveLayout(l)} value={chaveLayout(l)}>{l.nome}</option>)}</optgroup>
                </select>
              </div>
              <div>
                <Label className="text-xs">Legenda</Label>
                <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={8} className="w-full rounded-md border bg-background p-2 text-sm" />
              </div>
              {(dados.precoVenda == null || !dados.foto) && (
                <p className="rounded border border-warning bg-warning/10 p-2 text-xs">
                  {dados.precoVenda == null ? "Produto sem preço de venda. " : ""}{!dados.foto ? "Produto sem foto." : ""}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={enviar} disabled={gerando}>{gerando ? <Loader2 className="animate-spin" /> : <Share2 />} Compartilhar / baixar</Button>
                <Button variant="outline" onClick={copiarLegenda}><Copy /> Copiar legenda</Button>
                <Button variant="ghost" onClick={() => setEditor(true)}><ImagePlus /> Editor de post</Button>
              </div>
              <p className="text-xs text-muted-foreground">No celular abre o WhatsApp (ou outro app) com a imagem. No computador a imagem é baixada e a legenda fica copiada.</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
