// Item do tipo "assinatura": assina no aparelho; a imagem vira uma foto (PNG) e a resposta aponta para ela.
import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PenLine } from "lucide-react";
import { useDados } from "../app/dados";
import type { ValorResposta } from "../domain/tipos";
import { obterPosicao } from "../lib/gps";
import { Assinatura, type AssinaturaRef } from "./Assinatura";
import { Aviso, Botao } from "./base";
import { Miniatura } from "./FotosItem";

export function ItemAssinatura({ execId, itemId, valor, editavel }: { execId: string; itemId: string; valor: ValorResposta | null | undefined; editavel: boolean }) {
  const { db, repo } = useDados();
  const ref = useRef<AssinaturaRef>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [assinando, setAssinando] = useState(false);
  const fotoId = valor?.tipo === "assinatura" ? valor.v : null;
  const foto = useLiveQuery(() => (fotoId ? db.fotos.get(fotoId) : undefined), [fotoId]);

  async function salvar() {
    setErro(null);
    try {
      const png = await ref.current?.png();
      if (!png) throw new Error("Assine antes de salvar.");
      const f = await repo.adicionarFoto(execId, itemId, png, new Date().toISOString(), await obterPosicao(4000), "assinatura");
      await repo.responder(execId, itemId, { tipo: "assinatura", v: f.id });
      setAssinando(false);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="space-y-2">
      {foto && <Miniatura f={foto} />}
      {editavel && (assinando || !fotoId) ? (
        <>
          <Assinatura ref={ref} />
          <Botao type="button" onClick={salvar}><PenLine className="size-5" aria-hidden /> Salvar assinatura</Botao>
        </>
      ) : editavel && (
        <Botao type="button" variante="secundario" onClick={() => setAssinando(true)}>Assinar de novo</Botao>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}
