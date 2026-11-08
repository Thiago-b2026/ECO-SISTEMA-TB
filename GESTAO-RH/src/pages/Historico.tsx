import { useEffect, useState } from "react";
import { carregarNomes, supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useEmpresa } from "../contexts/EmpresaContext";
import { MESES, brl, calcular, normalizar } from "../lib/calc";
import { Aviso, Card } from "../components/ui";

interface Log {
  id: number;
  tab: string;
  ano: number;
  mes: number;
  data_antiga: unknown;
  data_nova: unknown;
  alterado_por: string | null;
  alterado_em: string;
}

const LIMITE = 200;

export default function Historico() {
  const { user } = useAuth();
  const { empresa, lojas, isGestor } = useEmpresa();
  const [logs, setLogs] = useState<Log[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; txt: string } | null>(null);
  const [filtroAno, setFiltroAno] = useState<string>("");

  async function carregar() {
    if (!empresa) return;
    setCarregando(true);
    let q = supabase
      .from("rh_entries_log")
      .select("id,tab,ano,mes,data_antiga,data_nova,alterado_por,alterado_em")
      .eq("empresa_id", empresa.id)
      .order("alterado_em", { ascending: false })
      .limit(LIMITE);
    if (filtroAno) q = q.eq("ano", Number(filtroAno));
    const { data, error } = await q;
    if (error) setMsg({ tipo: "erro", txt: error.message });
    setLogs((data as Log[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    carregarNomes().then(setNomes);
  }, [empresa?.id, filtroAno]);

  const custo = (d: unknown) => (d ? calcular(normalizar(d, lojas), lojas, empresa!).custoGlobal : null);
  const fat = (d: unknown) => (d ? calcular(normalizar(d, lojas), lojas, empresa!).fatGlobal : null);

  async function restaurar(l: Log) {
    if (!l.data_antiga) return;
    if (!confirm(`Restaurar ${l.tab === "provisao" ? "Provisão" : "Realizado"} de ${MESES[l.mes]}/${l.ano} para como estava ANTES desta alteração?`)) return;
    const { error } = await supabase
      .from("rh_entries")
      .upsert({ empresa_id: empresa!.id, tab: l.tab, ano: l.ano, mes: l.mes, data: l.data_antiga, updated_by: user!.id }, { onConflict: "empresa_id,tab,ano,mes" });
    setMsg(error ? { tipo: "erro", txt: error.message } : { tipo: "ok", txt: "Versão restaurada. A restauração também ficou registrada no histórico." });
    carregar();
  }

  const anoAtual = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico de alterações</h1>
          <p className="text-sm text-muted-foreground">Cada alteração guarda o valor anterior, então nada se perde.</p>
        </div>
        <select value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)} className="rounded-md bg-card border border-border px-3 py-2 text-sm">
          <option value="">Todos os anos</option>
          {Array.from({ length: anoAtual + 1 - 2023 + 1 }, (_, i) => 2023 + i).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.txt}</Aviso>}
      <Card titulo={`Últimas ${LIMITE} alterações`}>
        {carregando ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Quando</th>
                  <th className="py-2 px-2 font-medium">Quem</th>
                  <th className="py-2 px-2 font-medium">Lançamento</th>
                  <th className="py-2 px-2 font-medium text-right">Faturamento</th>
                  <th className="py-2 px-2 font-medium text-right">Custo total</th>
                  {isGestor && <th className="py-2 pl-2" />}
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const ca = custo(l.data_antiga), cn = custo(l.data_nova);
                  const fa = fat(l.data_antiga), fn = fat(l.data_nova);
                  return (
                    <tr key={l.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 whitespace-nowrap">{new Date(l.alterado_em).toLocaleString("pt-BR")}</td>
                      <td className="py-2 px-2">{nomes[l.alterado_por ?? ""] ?? "—"}</td>
                      <td className="py-2 px-2">{l.tab === "provisao" ? "Provisão" : "Realizado"} • {MESES[l.mes]}/{l.ano}</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {fa !== null && fa !== fn && <span className="text-muted-foreground line-through mr-2">{brl(fa)}</span>}
                        {fn !== null ? brl(fn) : "—"}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {ca !== null && ca !== cn && <span className="text-muted-foreground line-through mr-2">{brl(ca)}</span>}
                        {cn !== null ? brl(cn) : "—"}
                      </td>
                      {isGestor && (
                        <td className="py-2 pl-2 text-right">
                          {l.data_antiga ? (
                            <button className="text-xs text-primary hover:underline whitespace-nowrap" onClick={() => restaurar(l)}>Desfazer</button>
                          ) : (
                            <span className="text-xs text-muted-foreground">criação</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
