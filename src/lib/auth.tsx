import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type AppRole = "admin" | "gerente" | "vendedor" | "estoquista";

export interface Profile {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function apply(sess: Session | null) {
      setSession(sess);
      if (!sess?.user) {
        setProfile(null);
        setRole(null);
        if (active) setLoading(false);
        return;
      }
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id, nome, email, ativo").eq("id", sess.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", sess.user.id).maybeSingle(),
      ]);
      if (!active) return;
      setProfile((p as Profile) ?? null);
      setRole((r?.role as AppRole) ?? null);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      // Evita chamar o Supabase dentro do callback (recomendação da lib)
      setTimeout(() => apply(sess), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: "E-mail ou senha inválidos" } : {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider
      value={{ user: session?.user ?? null, session, profile, role, loading, signIn, signOut }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return c;
}

/** Tela inicial de cada perfil depois do login. */
export function homeRouteFor(role: AppRole | null): string {
  switch (role) {
    case "admin":
    case "gerente":
      return "/relatorios";
    case "vendedor":
      return "/pdv";
    case "estoquista":
      return "/lotes";
    default:
      return "/sem-acesso";
  }
}
