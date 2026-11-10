// Banco de teste: PGlite (Postgres embutido) + esboço do Ecossistema + migrations reais do checklist.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
export const MIGRATIONS = readdirSync(resolve(raiz, "migrations")).filter((f) => f.endsWith(".sql")).sort();

export async function novoBanco(extra: string[] = []) {
  const db = new PGlite();
  await db.exec(readFileSync(resolve(import.meta.dirname, "stub_ecossistema.sql"), "utf8"));
  for (const f of [...MIGRATIONS, ...extra]) {
    const sql = readFileSync(resolve(raiz, "migrations", f), "utf8");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Falha na migration ${f}: ${(e as Error).message}`);
    }
  }
  return db;
}

export type Banco = Awaited<ReturnType<typeof novoBanco>>;

/** Executa como o usuário (role authenticated + auth.uid()). null = superusuário. */
export async function como<T>(db: Banco, usuario: string | null, fn: () => Promise<T>): Promise<T> {
  if (usuario) {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: usuario, role: "authenticated" })]);
    await db.exec("set role authenticated");
  }
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

export async function linhas<T = Record<string, unknown>>(db: Banco, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

/** Espera que o SQL falhe com uma mensagem que contenha o trecho. */
export async function falha(db: Banco, sql: string, params: unknown[], trecho: string | RegExp) {
  try {
    await db.query(sql, params);
  } catch (e) {
    const msg = (e as Error).message;
    if (typeof trecho === "string" ? msg.includes(trecho) : trecho.test(msg)) return msg;
    throw new Error(`Falhou com outra mensagem: ${msg}`);
  }
  throw new Error(`Era para falhar (${String(trecho)}): ${sql}`);
}
