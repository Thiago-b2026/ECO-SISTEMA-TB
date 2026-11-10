import SparkMD5 from "spark-md5";

export const novoId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Igual a Postgres md5(texto)::uuid. */
export function md5Uuid(texto: string): string {
  const h = SparkMD5.hash(texto);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Id do plano automático: o MESMO no celular e no banco (checklist.id_plano). */
export const idPlano = (execucaoId: string, itemId: string) => md5Uuid(`${execucaoId}:${itemId}`);
