// Acesso POR TELA, controlado no ECO (Cadastros → Login de acesso → Permissões, módulo RH).
// Lê public.minhas_telas('rh'): só as telas do próprio usuário (admin do ECO recebe todas).
// A permissão de tela só decide o que APARECE; os dados continuam pelos papéis
// Dono/Admin/Operador de cada empresa (RLS do schema rh).
// Só o admin do Ecossistema cria empresas e dá acessos ("Usuários do Gestão RH" é exclusiva dele).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

export type TelaRh = "rh.painel" | "rh.historico" | "rh.global" | "rh.empresas" | "rh.usuarios";

export const TELAS_RH: { codigo: TelaRh; rota: string; nome: string }[] = [
  { codigo: "rh.painel", rota: "/", nome: "Painel" },
  { codigo: "rh.historico", rota: "/historico", nome: "Histórico" },
  { codigo: "rh.global", rota: "/global", nome: "Visão Global" },
  { codigo: "rh.empresas", rota: "/empresas", nome: "Empresas" },
  { codigo: "rh.usuarios", rota: "/usuarios", nome: "Usuários" },
];

interface TelasCtx {
  pode: (t: TelaRh) => boolean;
  /** Admin do Ecossistema (public.is_admin()): só ele cria empresas e dá acessos. */
  admin: boolean;
  carregando: boolean;
  /** true = minhas_telas deu erro (migration ainda não aplicada): tudo como antes. */
  modoLegado: boolean;
  primeira: { rota: string; nome: string } | null;
}

const Ctx = createContext<TelasCtx>({ pode: () => true, admin: false, carregando: false, modoLegado: false, primeira: null });

export function TelasProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [liberadas, setLiberadas] = useState<Set<string> | null>(null);
  const [modoLegado, setModoLegado] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    let ativo = true;
    setLiberadas(null);
    supabase
      .schema("public")
      .rpc("is_admin")
      .then(({ data }) => {
        if (ativo) setAdmin(data === true);
      });
    supabase
      .schema("public")
      .rpc("minhas_telas", { _app: "rh" })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          // Proteção na publicação: sem a migration, NÃO bloqueia ninguém (comportamento antigo).
          console.warn("minhas_telas indisponível; usando o acesso antigo.", error.message);
          setModoLegado(true);
          setLiberadas(new Set(TELAS_RH.map((t) => t.codigo)));
          return;
        }
        setModoLegado(false);
        setLiberadas(new Set(((data ?? []) as unknown[]).map((x) => (typeof x === "string" ? x : String(Object.values(x as object)[0])))));
      });
    return () => {
      ativo = false;
    };
  }, [user?.id]);

  const pode = (t: TelaRh) => !!liberadas?.has(t);
  const p = TELAS_RH.find((t) => liberadas?.has(t.codigo));
  return (
    <Ctx.Provider value={{ pode, admin, carregando: liberadas === null, modoLegado, primeira: p ? { rota: p.rota, nome: p.nome } : null }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTelas = () => useContext(Ctx);
