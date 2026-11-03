import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { CAMPOS_PADRAO, carregarModelos, htmlEtiquetas, MODELOS_ETIQUETA, type CamposEtiqueta, type ModeloEtiqueta } from "@/lib/etiquetas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/etiquetas")({ component: EditorEtiquetas });

const EXEMPLO = [{ titulo: "Liquidificador Philco 1500W 3,1L 12 Velocidades PLQ15A", sku: "P1234", preco: 179.99, precoDe: 199, grade: "A", copias: 1 }];
const NOMES_CAMPOS: Record<keyof CamposEtiqueta, string> = {
  titulo: "Nome do produto", de: "Preço \"De\"", off: "% OFF", grade: "Grade", codigo: "Código de barras", sku: "SKU", loja: "Nome da loja",
};

/** Editor de modelos de etiqueta: tamanho, campos visíveis e fontes, com prévia ao vivo. */
function EditorEtiquetas() {
  const [modelos, setModelos] = useState<ModeloEtiqueta[]>([]);
  const [m, setM] = useState<ModeloEtiqueta>({ ...MODELOS_ETIQUETA[0], id: "", nome: "Meu modelo", campos: { ...CAMPOS_PADRAO } });
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setModelos(await carregarModelos());
  }
  useEffect(() => {
    carregar();
  }, []);

  const campos = m.campos ?? CAMPOS_PADRAO;
  const num = (k: keyof ModeloEtiqueta, v: string) => setM({ ...m, [k]: Math.max(0, Number(v.replace(",", ".")) || 0) });

  async function salvar() {
    if (!m.nome.trim()) return toast.error("Dê um nome ao modelo.");
    if (m.largura < 15 || m.altura < 10 || m.porLinha < 1) return toast.error("Tamanho inválido.");
    setSalvando(true);
    const { id, nome, personalizado: _p, ...config } = m;
    const r = m.personalizado && id
      ? await supabase.from("modelos_etiqueta").update({ nome: nome.trim(), config }).eq("id", id)
      : await supabase.from("modelos_etiqueta").insert({ nome: nome.trim(), config });
    setSalvando(false);
    if (r.error) return toast.error(r.error.message.includes("duplicate") ? "Já existe um modelo com esse nome." : r.error.message);
    toast.success("Modelo salvo. Ele aparece na hora de imprimir (★).");
    carregar();
  }

  async function excluir() {
    if (!m.personalizado || !window.confirm(`Excluir o modelo "${m.nome}"?`)) return;
    const { error } = await supabase.from("modelos_etiqueta").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    setM({ ...m, id: "", personalizado: false });
    carregar();
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Editor de etiquetas</h1>
        <p className="text-sm text-muted-foreground">Crie modelos para a sua impressora. Comece de um pronto e ajuste.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="p-4 space-y-3">
          <div>
            <Label>Começar de</Label>
            <select value={m.id} onChange={(e) => { const b = modelos.find((x) => x.id === e.target.value); if (b) setM({ ...b, campos: { ...CAMPOS_PADRAO, ...b.campos }, nome: b.personalizado ? b.nome : `${b.nome} (cópia)` }); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Escolha…</option>
              {modelos.map((x) => <option key={x.id} value={x.id}>{x.personalizado ? "★ " : ""}{x.nome}</option>)}
            </select>
          </div>
          <div><Label>Nome do modelo</Label><Input value={m.nome} onChange={(e) => setM({ ...m, nome: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Largura (mm)</Label><Input value={m.largura} onChange={(e) => num("largura", e.target.value)} /></div>
            <div><Label className="text-xs">Altura (mm)</Label><Input value={m.altura} onChange={(e) => num("altura", e.target.value)} /></div>
            <div><Label className="text-xs">Etiquetas por linha</Label><Input value={m.porLinha} onChange={(e) => num("porLinha", e.target.value)} /></div>
            <div><Label className="text-xs">Espaço entre (mm)</Label><Input value={m.espaco} onChange={(e) => num("espaco", e.target.value)} /></div>
            <div><Label className="text-xs">Fonte do nome (pt, 0=auto)</Label><Input value={m.fonteTitulo ?? 0} onChange={(e) => num("fonteTitulo", e.target.value)} /></div>
            <div><Label className="text-xs">Fonte do preço (pt, 0=auto)</Label><Input value={m.fontePreco ?? 0} onChange={(e) => num("fontePreco", e.target.value)} /></div>
            <div><Label className="text-xs">Altura do código (mm, 0=auto)</Label><Input value={m.alturaCodigo ?? 0} onChange={(e) => num("alturaCodigo", e.target.value)} /></div>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">O que aparece</div>
            {(Object.keys(NOMES_CAMPOS) as (keyof CamposEtiqueta)[]).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={campos[k]} onChange={(e) => setM({ ...m, campos: { ...campos, [k]: e.target.checked } })} />
                {NOMES_CAMPOS[k]}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={salvar} disabled={salvando} className="flex-1">{salvando ? <Loader2 className="animate-spin" /> : <Save />} {m.personalizado ? "Salvar alterações" : "Salvar como novo"}</Button>
            {m.personalizado && <Button variant="outline" onClick={excluir}><Trash2 className="text-destructive" /></Button>}
          </div>
        </Card>
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">Prévia (tamanho real aproximado)</div>
          <div className="overflow-auto rounded border bg-muted/40 p-4">
            <iframe title="Prévia" srcDoc={htmlEtiquetas(EXEMPLO, { ...m, campos }, "Matriz", { imprimir: false })}
              style={{ width: `${m.largura * m.porLinha + m.espaco * (m.porLinha - 1) + 2}mm`, height: `${m.altura + 2}mm`, border: 0, background: "#fff" }} />
          </div>
        </Card>
      </div>
    </div>
  );
}
