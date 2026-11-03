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
  /** Não-admin com mais de uma loja ainda não escolheu a empresa desta sessão */
  precisaEscolher: boolean;
  /** Pode trocar de loja pelo menu (só admin) */
  podeTrocar: boolean;
  escolherEmpresa: (id: string) => void;
}

const Ctx = createContext<LojaState | undefined>(undefined);
const CHAVE = "eco.lojaAtual";
const SESSAO = "eco.lojaSessao";
const lerSessao = () => { try { return sessionStorage.getItem(SESSAO); } catch { return null; } };

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
    else { try { sessionStorage.removeItem(SESSAO); } catch { /* sem storage */ } }
  }, [user?.id, role]);

  const admin = role === "admin";
  const [sessao, setSessao] = useState<string | null>(lerSessao());
  // não-admin: a loja é a escolhida no login (ou a única que ele tem)
  useEffect(() => {
    if (admin || !lojas.length) return;
    const fixa = lojas.length === 1 ? lojas[0].id : sessao && lojas.some((l) => l.id === sessao) ? sessao : null;
    if (fixa && lojaAtual !== fixa) setLojaAtualState(fixa);
  }, [admin, lojas, sessao]);
  function escolherEmpresa(id: string) {
    try { sessionStorage.setItem(SESSAO, id); } catch { /* sem storage */ }
    setSessao(id);
    setLojaAtualState(id);
  }
  const precisaEscolher = !admin && !carregando && lojas.length > 1 && !(sessao && lojas.some((l) => l.id === sessao));

  function setLojaAtual(id: string) {
    if (!admin) return; // só o admin troca de loja
    setLojaAtualState(id);
    try {
      localStorage.setItem(CHAVE, id);
    } catch {
      /* navegador sem storage: só não lembra a escolha */
    }
  }

  const filtroLoja = lojaAtual === TODAS || !lojaAtual ? null : lojaAtual;

  return (
    <Ctx.Provider value={{ lojas, lojaAtual, setLojaAtual, carregando, recarregar, filtroLoja, precisaEscolher, podeTrocar: admin, escolherEmpresa }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLoja() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLoja precisa estar dentro de LojaProvider");
  return c;
}
