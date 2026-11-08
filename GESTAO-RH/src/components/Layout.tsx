import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useEmpresa } from "../contexts/EmpresaContext";
import { PAPEL_LABEL } from "../lib/types";
import { useTelas } from "../contexts/TelasContext";

export default function Layout() {
  const { user, sair } = useAuth();
  const { empresas, empresa, selecionar, isGestor, papel } = useEmpresa();
  const { pode, modoLegado } = useTelas();

  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm transition ${isActive ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary grid place-items-center font-bold">RH</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">Gestão RH</div>
              {empresas.length > 0 ? (
                <select
                  value={empresa?.id ?? ""}
                  onChange={(e) => selecionar(e.target.value)}
                  className="bg-transparent text-xs text-muted-foreground hover:text-foreground focus:outline-none max-w-[220px] truncate"
                  title="Trocar de empresa"
                >
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id} className="bg-card">
                      {e.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-muted-foreground">Nenhuma empresa</div>
              )}
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            {empresa && (
              <>
                {pode("rh.painel") && <NavLink to="/" end className={link}>Painel</NavLink>}
                {pode("rh.historico") && <NavLink to="/historico" className={link}>Histórico</NavLink>}
                {pode("rh.usuarios") && <NavLink to="/usuarios" className={link}>Usuários</NavLink>}
              </>
            )}
            {empresas.length > 0 && pode("rh.global") && <NavLink to="/global" className={link}>Visão Global</NavLink>}
            {pode("rh.empresas") && <NavLink to="/empresas" className={link}>Empresas</NavLink>}
          </nav>

          <div className="flex items-center gap-3 text-right">
            <div className="hidden sm:block">
              <div className="text-xs text-muted-foreground truncate max-w-[180px]">{user?.email}</div>
              {papel && <div className="text-[11px] text-primary">{PAPEL_LABEL[papel]}</div>}
            </div>
            <button onClick={sair} className="btn-secundario px-3 py-1.5 text-xs">Sair</button>
          </div>
        </div>
      </header>
      {modoLegado && (
        <div className="no-print border-b border-warning/40 bg-warning/15 px-4 py-2 text-xs text-warning">
          Controle de acesso por tela ainda não ativado no banco: todas as telas estão liberadas como antes.
        </div>
      )}
      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
