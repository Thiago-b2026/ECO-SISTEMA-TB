// Fotos de um item: miniaturas + botão de câmera.
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, CloudOff, CloudUpload, Trash2 } from "lucide-react";
import { useDados } from "../app/dados";
import { dataHoraSP } from "../domain/tempo";
import type { FotoLocal } from "../data/local";
import { servidor } from "../data/conexao";
import { Aviso, Botao, Selo } from "./base";

export function Miniatura({ f, onRemover }: { f: FotoLocal; onRemover?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    if (f.blob) {
      u = URL.createObjectURL(f.blob);
      setUrl(u);
    } else {
      servidor.urlArquivo(f.storage_path).then(setUrl).catch(() => setUrl(null));
    }
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [f.id, f.blob, f.storage_path]);
  return (
    <figure className="relative w-28">
      {url ? <img src={url} alt={`Foto de ${dataHoraSP(f.tirada_em)}`} className="h-28 w-28 rounded-lg border object-cover" />
        : <div className="grid h-28 w-28 place-items-center rounded-lg border bg-gray-100 text-xs text-gray-600">sem prévia</div>}
      <figcaption className="mt-1 space-y-0.5 text-[11px] leading-tight text-gray-700">
        <div>{dataHoraSP(f.tirada_em)}</div>
        {f.enviada ? <Selo tom="ok" icone={CloudUpload}>Enviada</Selo> : <Selo tom="alerta" icone={CloudOff}>No aparelho</Selo>}
      </figcaption>
      {onRemover && !f.enviada && (
        <button type="button" onClick={onRemover} aria-label="Apagar foto" className="absolute right-1 top-1 grid size-9 place-items-center rounded-full bg-white/90 text-red-700 shadow">
          <Trash2 className="size-4" aria-hidden />
        </button>
      )}
    </figure>
  );
}

export function FotosItem({ execId, itemId, editavel, obrigatoria }: { execId: string; itemId: string; editavel: boolean; obrigatoria: boolean }) {
  const { db, repo } = useDados();
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fotos = useLiveQuery(() => db.fotos.where("[execucao_id+item_id]").equals([execId, itemId]).toArray(), [execId, itemId]) ?? [];

  async function escolheu(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setOcupado(true);
    try {
      await repo.adicionarFoto(execId, itemId, arquivo, new Date().toISOString(), null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {fotos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {fotos.map((f) => <Miniatura key={f.id} f={f} onRemover={editavel ? () => void repo.removerFoto(f.id) : undefined} />)}
        </div>
      )}
      {editavel && (
        <>
          <input ref={entrada} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => escolheu(e.target.files?.[0])} />
          <Botao type="button" variante={obrigatoria && !fotos.length ? "primario" : "secundario"} carregando={ocupado} onClick={() => entrada.current?.click()}>
            <Camera className="size-5" aria-hidden /> {fotos.length ? "Outra foto" : obrigatoria ? "Tirar foto (obrigatória)" : "Tirar foto"}
          </Botao>
        </>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}
