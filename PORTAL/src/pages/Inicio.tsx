// Tela inicial: um quadro para cada sistema que a pessoa tem liberado (public.meus_sistemas()).
// Clicar no quadro abre o sistema na mesma aba (nesta etapa a pessoa entra com o login lá).
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface Sistema {
  codigo: string;
  nome: string;
  url: string | null;
  ordem: number;
}

const IconeCarrinho = () => (
  <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);
const IconePessoas = () => (
  <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconeGrade = () => (
  <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

/** Como cada sistema aparece no quadro (o resto vem do banco). */
const QUADROS: Record<string, { titulo: string; descricao: string; icone: ReactNode }> = {
  pdv: { titulo: "Gestão Salvados", descricao: "PDV, estoque, caixa e financeiro", icone: <IconeCarrinho /> },
  rh: { titulo: "Gestão RH", descricao: "Custos de pessoal por loja", icone: <IconePessoas /> },
};

export default function Inicio({ sessao }: { sessao: Session }) {
  const [sistemas, setSistemas] = useState<Sistema[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState<string>("");

  const carregar = useCallback(async () => {
    setErro(null);
    setSistemas(null);
    const [s, p] = await Promise.all([
      supabase.rpc("meus_sistemas"),
      supabase.from("profiles").select("nome").eq("id", sessao.user.id).maybeSingle(),
    ]);
    if (s.error) {
      setErro("Não foi possível carregar os seus sistemas. Tente de novo.");
      setSistemas([]);
    } else {
      setSistemas(((s.data ?? []) as Sistema[]).filter((x) => x.url).sort((a, b) => a.ordem - b.ordem));
    }
    setNome((p.data?.nome as string | undefined) || sessao.user.email || "");
  }, [sessao.user.id, sessao.user.email]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="titulo text-lg text-primary sm:text-xl">Ecossistema TB</h1>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-muted-foreground sm:inline">{nome}</span>
            <button className="botao-secundario px-3 py-2" onClick={() => supabase.auth.signOut()}>Sair</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        <h2 className="titulo mb-4 text-sm text-muted-foreground">Seus sistemas</h2>

        {sistemas === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : erro ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm">{erro}</p>
            <button className="botao-primario mt-4" onClick={carregar}>Tentar de novo</button>
          </div>
        ) : sistemas.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Você ainda não tem acesso a nenhum sistema. Peça ao administrador.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sistemas.map((s) => {
              const q = QUADROS[s.codigo] ?? { titulo: s.nome, descricao: "", icone: <IconeGrade /> };
              return (
                <a
                  key={s.codigo}
                  href={s.url!}
                  className="group flex min-h-[10rem] flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <div className="flex items-start gap-4">
                    <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{q.icone}</div>
                    <div className="min-w-0">
                      <div className="titulo text-lg leading-tight">{q.titulo}</div>
                      {q.descricao && <div className="mt-1 text-sm text-muted-foreground">{q.descricao}</div>}
                    </div>
                  </div>
                  <div className="mt-4 self-end text-sm font-bold uppercase tracking-wide text-primary group-hover:underline">Abrir →</div>
                </a>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
