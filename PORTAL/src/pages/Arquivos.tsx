// Página de um quadro que abre DENTRO do Portal (POP, Precificação): lista os arquivos da pasta
// <codigo>/ do bucket PRIVADO "portal-arquivos". Quem lê é decidido pelo banco (só quem tem acesso
// ao sistema); só o admin envia, troca ou apaga.
// - HTML e Markdown abrem aqui mesmo, numa moldura isolada (sandbox, sem acesso ao login do Portal).
// - PDF abre aqui ou em nova aba. Planilhas, CSV e o resto: baixar.
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { marked } from "marked";
import { BUCKET, supabase } from "../lib/supabase";
import { QUADROS } from "../lib/quadros";

interface Arquivo {
  nome: string;
  tamanho: number;
  atualizado: string | null;
}

interface Visualizacao {
  titulo: string;
  html?: string; // para srcdoc
  url?: string; // blob (PDF)
}

const extensao = (nome: string) => (nome.split(".").pop() ?? "").toLowerCase();
const tituloDoArquivo = (nome: string) => nome.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
const ABRE_AQUI = new Set(["html", "htm", "md", "txt", "pdf"]);
const MAX_MB = 50;

function tamanhoLegivel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Nome seguro para o armazenamento (sem acento e sem caracteres especiais). */
export function nomeSeguro(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._() -]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const paginaSimples = (corpo: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:ui-sans-serif,system-ui,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.55;color:#1f2933;max-width:960px;margin:0 auto;padding:16px}
h1,h2,h3{line-height:1.25}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;font-size:14px}
th,td{border:1px solid #d9dee5;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f2f5f8}
pre{white-space:pre-wrap;word-break:break-word}code{background:#f2f5f8;padding:1px 4px;border-radius:4px}
</style></head><body>${corpo}</body></html>`;

export default function Arquivos({ codigo, admin }: { codigo: string; admin: boolean }) {
  const info = QUADROS[codigo];
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ver, setVer] = useState<Visualizacao | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    const { data, error } = await supabase.storage.from(BUCKET).list(codigo, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) {
      setErro("Não foi possível carregar os arquivos. Tente de novo.");
      setArquivos([]);
      return;
    }
    setArquivos(
      (data ?? [])
        .filter((f) => f.id && !f.name.startsWith("."))
        .map((f) => ({ nome: f.name, tamanho: (f.metadata as { size?: number } | null)?.size ?? 0, atualizado: f.updated_at ?? null })),
    );
  }, [codigo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // libera a memória do PDF ao fechar
  useEffect(() => () => { if (ver?.url) URL.revokeObjectURL(ver.url); }, [ver]);

  async function baixarBlob(nome: string) {
    const { data, error } = await supabase.storage.from(BUCKET).download(`${codigo}/${nome}`);
    if (error || !data) throw new Error("Não foi possível abrir o arquivo.");
    return data;
  }

  async function abrir(a: Arquivo) {
    setAviso(null);
    setOcupado(a.nome);
    try {
      const ext = extensao(a.nome);
      const titulo = tituloDoArquivo(a.nome);
      if (ext === "pdf") {
        const blob = await baixarBlob(a.nome);
        setVer({ titulo, url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) });
      } else if (ext === "html" || ext === "htm") {
        setVer({ titulo, html: await (await baixarBlob(a.nome)).text() });
      } else if (ext === "md") {
        const texto = await (await baixarBlob(a.nome)).text();
        setVer({ titulo, html: paginaSimples(await marked.parse(texto)) });
      } else if (ext === "txt") {
        const texto = await (await baixarBlob(a.nome)).text();
        setVer({ titulo, html: paginaSimples(`<pre>${escapar(texto)}</pre>`) });
      } else {
        await baixar(a);
      }
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function baixar(a: Arquivo) {
    setAviso(null);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(`${codigo}/${a.nome}`, 60, { download: a.nome });
    if (error || !data) {
      setAviso("Não foi possível baixar o arquivo.");
      return;
    }
    window.location.assign(data.signedUrl);
  }

  async function enviar(e: ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (lista.length === 0) return;
    setAviso(null);
    const grandes = lista.filter((f) => f.size > MAX_MB * 1024 * 1024);
    const falhas: string[] = grandes.map((f) => `${f.name} (passa de ${MAX_MB} MB)`);
    const enviar = lista.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    for (const [i, f] of enviar.entries()) {
      setOcupado(`Enviando ${i + 1} de ${enviar.length}: ${f.name}`);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${codigo}/${nomeSeguro(f.name)}`, f, { upsert: true, contentType: f.type || undefined });
      if (error) falhas.push(`${f.name} (${error.message})`);
    }
    setOcupado(null);
    setAviso(falhas.length ? `Não foram enviados: ${falhas.join("; ")}` : `${enviar.length} arquivo(s) enviado(s).`);
    carregar();
  }

  async function apagar(a: Arquivo) {
    if (!window.confirm(`Apagar "${a.nome}"? Não dá para desfazer.`)) return;
    setOcupado(a.nome);
    const { error } = await supabase.storage.from(BUCKET).remove([`${codigo}/${a.nome}`]);
    setOcupado(null);
    setAviso(error ? "Não foi possível apagar o arquivo." : `"${a.nome}" apagado.`);
    carregar();
  }

  if (ver) {
    return (
      <div className="fixed inset-0 z-20 flex flex-col bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <div className="titulo min-w-0 truncate text-sm sm:text-base">{ver.titulo}</div>
          <div className="flex shrink-0 gap-2">
            {ver.url && (
              <a className="botao-secundario px-3 py-2" href={ver.url} target="_blank" rel="noopener noreferrer">Nova aba</a>
            )}
            <button className="botao-primario px-3 py-2" onClick={() => setVer(null)}>Fechar</button>
          </div>
        </div>
        {ver.url ? (
          <iframe title={ver.titulo} src={ver.url} className="w-full flex-1 border-0 bg-white" />
        ) : (
          // moldura isolada: os scripts da página rodam, mas sem acesso ao login do Portal
          <iframe title={ver.titulo} srcDoc={ver.html} sandbox="allow-scripts allow-popups allow-modals allow-downloads" className="w-full flex-1 border-0 bg-white" />
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <div className="mb-5 flex items-start gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{info.icone}</div>
        <div className="min-w-0">
          <h2 className="titulo text-xl leading-tight">{info.titulo}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{info.descricao}</p>
        </div>
      </div>

      {admin && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-card p-4">
          <button className="botao-primario" onClick={() => entrada.current?.click()} disabled={!!ocupado}>+ Enviar arquivos</button>
          <span className="text-xs text-muted-foreground">
            Só o administrador vê esta parte. Arquivo com o mesmo nome é substituído. Até {MAX_MB} MB por arquivo.
          </span>
          <input ref={entrada} type="file" multiple className="hidden" onChange={enviar} />
        </div>
      )}

      {ocupado && <p className="mb-3 text-sm text-muted-foreground">{ocupado.startsWith("Enviando") ? ocupado : "Abrindo…"}</p>}
      {aviso && <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm">{aviso}</p>}

      {arquivos === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : erro ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm">{erro}</p>
          <button className="botao-primario mt-4" onClick={carregar}>Tentar de novo</button>
        </div>
      ) : arquivos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Ainda não há arquivos aqui.{admin && " Use “+ Enviar arquivos” para colocar os primeiros."}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {arquivos.map((a) => {
            const ext = extensao(a.nome);
            return (
              <li key={a.nome} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid h-8 w-12 shrink-0 place-items-center rounded bg-primary/10 text-[11px] font-bold uppercase text-primary">{ext || "?"}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={a.nome}>{tituloDoArquivo(a.nome)}</div>
                  <div className="text-xs text-muted-foreground">
                    {tamanhoLegivel(a.tamanho)}
                    {a.atualizado && ` · atualizado em ${new Date(a.atualizado).toLocaleDateString("pt-BR")}`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {ABRE_AQUI.has(ext) && (
                    <button className="botao-primario px-3 py-2" onClick={() => abrir(a)} disabled={!!ocupado}>Abrir</button>
                  )}
                  <button className="botao-secundario px-3 py-2" onClick={() => baixar(a)} disabled={!!ocupado}>Baixar</button>
                  {admin && (
                    <button className="botao-secundario px-3 py-2 text-destructive" onClick={() => apagar(a)} disabled={!!ocupado} aria-label={`Apagar ${a.nome}`}>Apagar</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
