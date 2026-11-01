import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, PlugZap, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fmtBRL } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";


interface Status {
  conectado: boolean;
  ml_nickname: string | null;
  ml_user_id: number;
  atualizado_em: string;
}

interface Candidato {
  id: string;
  tipo: "produto" | "item";
  titulo: string;
  preco: number | null;
  preco_original: number | null;
  foto: string | null;
  link: string | null;
  gtin: string | null;
  marca: string | null;
  modelo: string | null;
  similaridade: number | null;
}

type TipoBusca = "ean" | "nome" | "link";
const TIPOS: { id: TipoBusca; label: string; placeholder: string }[] = [
  { id: "ean", label: "Código de barras", placeholder: "Digite ou bipe o código (EAN)" },
  { id: "nome", label: "Nome do produto", placeholder: "Ex.: liquidificador philco 1200w" },
  { id: "link", label: "Link do anúncio", placeholder: "Cole o link do Mercado Livre" },
];

/** Lê a mensagem de erro que a Edge Function devolveu. */
async function erroDaFuncao(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    const body = await ctx.json().catch(() => null);
    if (body?.erro) return body.erro;
  }
  return (error as Error).message ?? "Erro desconhecido";
}

/** Conexão com o Mercado Livre + teste de busca (aba "Configuração Mercado Livre" em Lotes). */
export function MercadoLivreConfig() {
  const { role } = useAuth();
  const podeConectar = role === "admin" || role === "gerente";
  const [status, setStatus] = useState<Status | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);

  const [tipo, setTipo] = useState<TipoBusca>("ean");
  const [valor, setValor] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<Candidato[] | null>(null);

  async function carregarStatus() {
    setCarregando(true);
    const { data, error } = await supabase.rpc("ml_status");
    setCarregando(false);
    if (error) return toast.error("Não foi possível ler o status: " + error.message);
    setStatus((data as Status[])?.[0] ?? null);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ml = params.get("ml");
    if (ml === "ok") toast.success("Conta do Mercado Livre conectada!");
    if (ml === "erro") toast.error("Não foi possível conectar: " + (params.get("detalhe") ?? "erro desconhecido"));
    if (ml) window.history.replaceState(null, "", window.location.pathname);
    carregarStatus();
  }, []);

  async function conectar() {
    setConectando(true);
    const { data, error } = await supabase.functions.invoke("ml-oauth-start");
    if (error || !data?.url) {
      setConectando(false);
      return toast.error("Não foi possível iniciar a conexão: " + (error ? await erroDaFuncao(error) : "sem URL"));
    }
    window.location.href = data.url; // vai para o Mercado Livre e volta para esta tela
  }

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!valor.trim()) return;
    setBuscando(true);
    setResultado(null);
    const { data, error } = await supabase.functions.invoke("ml-buscar", { body: { tipo, valor: valor.trim() } });
    setBuscando(false);
    if (error) return toast.error(await erroDaFuncao(error));
    setResultado(data.candidatos ?? []);
  }

  const tipoAtual = TIPOS.find((t) => t.id === tipo)!;

  return (
    <div className="space-y-4 max-w-3xl">

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Conexão</h2>
        {carregando ? (
          <Loader2 className="animate-spin text-muted-foreground" />
        ) : status?.conectado ? (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-5 text-success" />
            <span>
              Conectado como <strong>{status.ml_nickname ?? status.ml_user_id}</strong>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <XCircle className="size-5" />
            <span>Nenhuma conta do Mercado Livre conectada.</span>
          </div>
        )}
        {podeConectar && (
          <Button onClick={conectar} disabled={conectando} variant={status?.conectado ? "outline" : "default"}>
            {conectando ? <Loader2 className="animate-spin" /> : <PlugZap />}
            {status?.conectado ? "Reconectar conta" : "Conectar conta do Mercado Livre"}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Use a conta <strong>principal</strong> da loja (não a de colaborador). A conexão vale por até 6 meses e é renovada
          sozinha enquanto o sistema for usado.
        </p>
      </Card>

      {status?.conectado && (
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Testar busca</h2>
          <div className="flex flex-wrap gap-2">
            {TIPOS.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={t.id === tipo ? "default" : "outline"}
                onClick={() => {
                  setTipo(t.id);
                  setResultado(null);
                }}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <form onSubmit={buscar} className="flex gap-2">
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={tipoAtual.placeholder}
              inputMode={tipo === "ean" ? "numeric" : undefined}
              className="h-11"
              autoFocus
            />
            <Button type="submit" disabled={buscando} className="h-11">
              {buscando ? <Loader2 className="animate-spin" /> : <Search />}
              Buscar no ML
            </Button>
          </form>

          {resultado && resultado.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
          )}
          {resultado && resultado.length > 0 && (
            <ul className="divide-y rounded-md border">
              {resultado.map((c) => (
                <li key={c.id} className="flex gap-3 p-3">
                  {c.foto ? (
                    <img src={c.foto} alt="" className="size-16 shrink-0 rounded object-contain bg-white" />
                  ) : (
                    <div className="size-16 shrink-0 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium leading-snug">{c.titulo}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {c.preco != null ? (
                        <span className="font-semibold">{fmtBRL(c.preco)}</span>
                      ) : (
                        <Badge variant="outline">sem preço no momento</Badge>
                      )}
                      {c.preco_original != null && c.preco_original > (c.preco ?? 0) && (
                        <span className="text-muted-foreground line-through">{fmtBRL(c.preco_original)}</span>
                      )}
                      {c.similaridade != null && <Badge variant="secondary">{c.similaridade}% parecido</Badge>}
                      {c.marca && <span className="text-muted-foreground">{c.marca}</span>}
                      {c.gtin && <span className="text-muted-foreground">EAN {c.gtin}</span>}
                    </div>
                    {c.link && (
                      <a href={c.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Ver no Mercado Livre <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
