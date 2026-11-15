// Página inicial do ECO SISTEMA TB: um quadro grande para cada sistema que a pessoa tem LIBERADO.
// Quem vê o quê vem do banco (public.meus_sistemas()); o admin vê todos e também os "EM BREVE".
// >>> SISTEMA NOVO: cadastrar em public.sistemas (migration em GESTAO SALVADOS/supabase/migrations)
//     e, para ter ícone e descrição próprios, incluir em src/lib/quadros.tsx.
import type { Contexto } from "../App";
import Topo from "../components/Topo";
import { irPara } from "../lib/navegacao";
import { EM_BREVE, infoDo, type InfoQuadro } from "../lib/quadros";

const classeQuadro =
  "group flex min-h-[10rem] flex-col justify-between rounded-xl border border-border bg-card p-5 text-left shadow-sm transition";

function Conteudo({ info, rodape }: { info: InfoQuadro; rodape: string }) {
  return (
    <>
      <div className="flex items-start gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{info.icone}</div>
        <div className="min-w-0">
          <div className="titulo text-lg leading-tight">{info.titulo}</div>
          {info.descricao && <div className="mt-1 text-sm text-muted-foreground">{info.descricao}</div>}
        </div>
      </div>
      <div className="mt-4 self-end text-sm font-bold uppercase tracking-wide text-primary group-hover:underline">{rodape}</div>
    </>
  );
}

export default function Inicio({ ctx }: { ctx: Contexto }) {
  const { sistemas, erro, admin, nome, recarregar } = ctx;
  const ativos = new Set((sistemas ?? []).map((s) => s.codigo));
  const emBreve = admin ? EM_BREVE.filter((e) => !ativos.has(e.codigo)) : [];

  return (
    <div className="min-h-screen">
      <Topo nome={nome} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        <h2 className="titulo mb-4 text-sm text-muted-foreground">Seus sistemas</h2>

        {sistemas === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : erro ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm">{erro}</p>
            <button className="botao-primario mt-4" onClick={recarregar}>Tentar de novo</button>
          </div>
        ) : sistemas.length === 0 && emBreve.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Você ainda não tem acesso a nenhum sistema. Peça ao administrador.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sistemas.map((s) => {
              const info = infoDo(s.codigo, s.nome);
              const ativo = `${classeQuadro} hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40`;
              if (info.interno) {
                return (
                  <button key={s.codigo} className={ativo} onClick={() => irPara(`/${s.codigo}`)}>
                    <Conteudo info={info} rodape="Abrir →" />
                  </button>
                );
              }
              if (!s.url) {
                return (
                  <div key={s.codigo} className={`${classeQuadro} opacity-70`}>
                    <Conteudo info={info} rodape="Sem endereço" />
                  </div>
                );
              }
              return (
                <a key={s.codigo} href={s.url} className={ativo}>
                  <Conteudo info={info} rodape="Abrir →" />
                </a>
              );
            })}
            {emBreve.map((e) => (
              <div key={e.codigo} className={`${classeQuadro} border-dashed opacity-70`} aria-disabled>
                <Conteudo info={e.info} rodape="Em breve" />
              </div>
            ))}
          </div>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Cada sistema pede o seu e-mail e senha e mostra só o que você tem liberado.
          {admin && " Os quadros “Em breve” aparecem só para o administrador."}
        </p>
      </main>
    </div>
  );
}
