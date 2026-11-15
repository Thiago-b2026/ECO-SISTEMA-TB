import { supabase } from "../lib/supabase";
import { irPara } from "../lib/navegacao";

export default function Topo({ nome, voltar }: { nome: string; voltar?: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {voltar && (
            <button className="botao-secundario px-3 py-2" onClick={() => irPara("/")} aria-label="Voltar ao início">←</button>
          )}
          {/* nome numa linha só, também no celular */}
          <button className="titulo whitespace-nowrap text-lg text-primary sm:text-xl" onClick={() => irPara("/")}>ECO SISTEMA TB</button>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">{nome}</span>
          <button className="botao-secundario px-3 py-2" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </div>
    </header>
  );
}
