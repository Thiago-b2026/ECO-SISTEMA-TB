// Página inicial do ECO SISTEMA TB: um quadro grande para cada sistema.
// Página aberta (sem login). Clicar abre o sistema na mesma aba; o sistema pede a senha
// e mostra só o que a pessoa tem liberado.
// >>> SISTEMA NOVO: inclua o quadro na lista SISTEMAS abaixo (e no MEU SUPERVISOR/sistemas.json).
import type { ReactNode } from "react";

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

const IconePrancheta = () => (
  <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="4" width="14" height="18" rx="2" /><rect x="9" y="2" width="6" height="4" rx="1" />
    <path d="m9 12 2 2 4-4" /><path d="M9 18h6" />
  </svg>
);

interface Quadro {
  codigo: string; // mesmo código de public.sistemas / sistemas.json
  titulo: string;
  descricao: string;
  url: string;
  icone: ReactNode;
}

/** Quadros da página inicial (lista fixa enquanto o Portal não tem login). */
export const SISTEMAS: Quadro[] = [
  { codigo: "pdv", titulo: "Gestão Salvados", descricao: "PDV, estoque, caixa e financeiro", url: "https://eco-sistema-tb.vercel.app", icone: <IconeCarrinho /> },
  { codigo: "rh", titulo: "Gestão RH", descricao: "Custos de pessoal por loja", url: "https://gestao-rh-tau.vercel.app", icone: <IconePessoas /> },
  // url PREVISTA (projeto "checklist-grupotb" no time grupotb): confirmar na publicação
  { codigo: "checklist", titulo: "Check List Operacional", descricao: "Rotinas, fotos e planos de ação por loja", url: "https://checklist-grupotb.vercel.app", icone: <IconePrancheta /> },
];

export default function Inicio() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3">
          {/* nome numa linha só, também no celular */}
          <h1 className="titulo whitespace-nowrap text-lg text-primary sm:text-xl">ECO SISTEMA TB</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        <h2 className="titulo mb-4 text-sm text-muted-foreground">Sistemas</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SISTEMAS.map((q) => (
            <a
              key={q.codigo}
              href={q.url}
              className="group flex min-h-[10rem] flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <div className="flex items-start gap-4">
                <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{q.icone}</div>
                <div className="min-w-0">
                  <div className="titulo text-lg leading-tight">{q.titulo}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{q.descricao}</div>
                </div>
              </div>
              <div className="mt-4 self-end text-sm font-bold uppercase tracking-wide text-primary group-hover:underline">Abrir →</div>
            </a>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Ao abrir um sistema, entre com o seu e-mail e senha. Cada sistema mostra só o que você tem liberado.</p>
      </main>
    </div>
  );
}
