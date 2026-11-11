// Equipe de uma unidade no aparelho: quem é da unidade + os gestores da empresa (gestor vale para todas as unidades).
import type { BancoLocal } from "./local";
import { nivel, type Membro } from "./servidor";

export async function redeDaLoja(db: BancoLocal, loja: string): Promise<string | null> {
  return (await db.lojas.get(loja))?.rede_id ?? null;
}

export async function equipeDaLoja(db: BancoLocal, loja: string): Promise<Membro[]> {
  const rede = await redeDaLoja(db, loja);
  const daLoja = await db.membros.where("loja_id").equals(loja).toArray();
  const gestores = rede ? (await db.membros.where("rede_id").equals(rede).toArray()).filter((m) => m.loja_id == null) : [];
  return [...daLoja, ...gestores.filter((g) => !daLoja.some((m) => m.usuario_id === g.usuario_id))];
}

/** Responsável padrão do plano automático: supervisor da unidade; se não houver, gestor da empresa (igual ao banco). */
export function responsavelPadrao(equipe: Membro[]): string | null {
  return equipe.filter((m) => m.ativo && (m.perfil === "supervisor" || m.perfil === "gestor"))
    .sort((a, b) => nivel(a.perfil) - nivel(b.perfil))[0]?.usuario_id ?? null;
}

/** Nome de uma pessoa (pega o primeiro registro dela na equipe). */
export const nomeNaEquipe = (equipe: Membro[], usuario: string | null | undefined, vazio = "—") =>
  (usuario ? equipe.find((m) => m.usuario_id === usuario)?.nome : null) ?? (usuario ? "—" : vazio);
