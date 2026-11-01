// Loja atual (multiloja / filiais).
// Admin pode escolher "todas"; os demais só as lojas ligadas a eles.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export interface Loja {
  id: string;
  nome: string;
  codigo: string | null;
  ativo: boolean;
}

export const TODAS = "todas";

interface LojaState {
  lojas: Loja[];
  /** id da loja escolhida, ou "todas" (só admin) */
  lojaAtual: string;
  setLojaAtual: (id: string) => void;
  carregando: boolean;
  recarregar: () => Promise<void>;
  /** Filtro para consultas: null = todas as lojas permitidas */
  filtroLoja: string | null;
}

const Ctx = createContext<LojaState | undefined>(undefined);
const CHAVE = "eco.lojaAtual";

function lerSalvo(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function LojaProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [lojaAtual, setLojaAtualState] = useState<string>(lerSalvo() ?? "");
  const [carregando, setCarregando] = useState(true);

  async function recarregar() {
    const { data } = await supabase.rpc("minhas_lojas");
    const ls = (data ?? []) as Loja[];
    setLojas(ls);
    setLojaAtualState((atual) => {
      if (atual === TODAS && role === "admin") return atual;
      if (ls.some((l) => l.id === atual)) return atual;
      return ls[0]?.id ?? "";
    });
    setCarregando(false);
  }

  useEffect(() => {
    if (user) recarregar();
  }, [user?.id, role]);

  function setLojaAtual(id: string) {
    setLojaAtualState(id);
    try {
      localStorage.setItem(CHAVE, id);
    } catch {
      /* navegador sem storage: só não lembra a escolha */
    }
  }

  const filtroLoja = lojaAtual === TODAS || !lojaAtual ? null : lojaAtual;

  return (
    <Ctx.Provider value={{ lojas, lojaAtual, setLojaAtual, carregando, recarregar, filtroLoja }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLoja() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLoja precisa estar dentro de LojaProvider");
  return c;
}
