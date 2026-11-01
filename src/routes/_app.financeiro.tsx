import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/lib/loja";
import { fetchAllRows } from "@/lib/fetch-all";
import { fmtBRL, fmtDateOnly } from "@/lib/format";
import { lerNumero } from "@/lib/precificacao";
import { formatLocalDateInput } from "@/lib/sale-datetime";
import { compararCodigo } from "@/lib/plano-contas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Exportar } from "@/components/exportar";


export const Route = createFileRoute("/_app/financeiro")({ component: Financeiro });

interface Lanc {
  id: string; loja_id: string; tipo: "pagar" | "receber"; descricao: string; pessoa_id: string | null; plano_conta_id: string | null;
  conta_bancaria_id: string | null; valor: number; vencimento: string; status: "aberto" | "pago" | "cancelado";
  data_pagamento: string | null; valor_pago: number | null; documento: string | null; parcela: number; parcelas: number; origem: string;
}
interface Opcao { id: string; nome: string }
interface Plano { id: string; codigo: string; nome: string; tipo: "receita" | "despesa"; pai_id: string | null }
interface Saldo { conta_id: string; nome: string; loja_id: string; saldo_inicial: number; entradas: number; saidas: number; saldo: number }
interface Dia { dia: string; entradas: number; saidas: number; entradas_previstas: number; saidas_previstas: number }

const hoje = () => formatLocalDateInput();
const dataBR = (d: string | null) => (d ? fmtDateOnly(d + "T12:00:00") : "—");
const somarMeses = (iso: string, n: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1 + n, Math.min(d, 28)));
  return dt.toISOString().slice(0, 10);
};

type Aba = "pagar" | "receber" | "fluxo" | "contas";

function Financeiro() {
  const { filtroLoja, lojas } = useLoja();
  const [aba, setAba] = useState<Aba>("pagar");
  const [lancs, setLancs] = useState<Lanc[] | null>(null);
  const [pessoas, setPessoas] = useState<Opcao[]>([]);
  const [contas, setContas] = useState<(Opcao & { loja_id: string })[]>([]);
  const [plano, setPlano] = useState<Plano[]>([]);
  const [status, setStatus] = useState<"aberto" | "pago" | "todos">("aberto");
  const [de, setDe] = useState(hoje().slice(0, 8) + "01");
  const [ate, setAte] = useState(somarMeses(hoje().slice(0, 8) + "01", 1));
  const [novo, setNovo] = useState(false);
  const [baixa, setBaixa] = useState<Lanc | null>(null);

  async function carregar() {
    setLancs(null);
    const [l, p, c, pl] = await Promise.all([
      fetchAllRows<Lanc>(() => {
        let q = supabase.from("lancamentos").select("*").neq("status", "cancelado").order("vencimento");
        if (filtroLoja) q = q.eq("loja_id", filtroLoja);
        return q;
      }),
      supabase.from("pessoas").select("id, nome").or("eh_fornecedor.eq.true,eh_cliente.eq.true,eh_funcionario.eq.true").order("nome").limit(2000),
      supabase.from("contas_bancarias").select("id, nome, loja_id").eq("ativo", true).order("nome"),
      supabase.from("plano_contas").select("id, codigo, nome, tipo, pai_id").eq("ativo", true),
    ]);
    setLancs(l);
    setPessoas((p.data ?? []) as Opcao[]);
    setContas((c.data ?? []) as (Opcao & { loja_id: string })[]);
    setPlano(((pl.data ?? []) as Plano[]).sort((a, b) => compararCodigo(a.codigo, b.codigo)));
  }
  useEffect(() => {
    carregar();
  }, [filtroLoja]);

  const nome = (lista: Opcao[], id: string | null) => lista.find((x) => x.id === id)?.nome ?? "—";
  const nomePlano = (id: string | null) => { const p = plano.find((x) => x.id === id); return p ? `${p.codigo} ${p.nome}` : "—"; };

  async function cancelar(l: Lanc) {
    if (!window.confirm(`Cancelar "${l.descricao}" (${fmtBRL(Number(l.valor))})?`)) return;
    const { error } = await supabase.from("lancamentos").update({ status: "cancelado" }).eq("id", l.id);
    if (error) return toast.error(error.message);
    carregar();
  }
  async function estornar(l: Lanc) {
    const { error } = await supabase.rpc("estornar_lancamento", { _id: l.id });
    if (error) return toast.error(error.message);
    toast.success("Baixa estornada: voltou para aberto.");
    carregar();
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">{filtroLoja ? lojas.find((l) => l.id === filtroLoja)?.nome : "Todas as lojas"} · vendas no cartão/Pix com meio cadastrado entram sozinhas em "A receber"</p>
        </div>
        <Button onClick={() => setNovo(true)} disabled={!filtroLoja && lojas.length > 1}><Plus /> Novo lançamento</Button>
      </div>
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {([["pagar", "Contas a pagar"], ["receber", "Contas a receber"], ["fluxo", "Fluxo de caixa"], ["contas", "Saldos e extrato"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={aba === k ? "default" : "ghost"} onClick={() => setAba(k)}>{l}</Button>
        ))}
      </div>

      {(aba === "pagar" || aba === "receber") && (
        <ListaLanc
          tipo={aba} lancs={lancs} status={status} setStatus={setStatus} de={de} ate={ate} setDe={setDe} setAte={setAte}
          nomePessoa={(id) => nome(pessoas, id)} nomeConta={(id) => nome(contas, id)} nomePlano={nomePlano}
          lojaNome={filtroLoja ? undefined : (id) => lojas.find((l) => l.id === id)?.nome ?? ""}
          onBaixar={setBaixa} onCancelar={cancelar} onEstornar={estornar}
        />
      )}
      {aba === "fluxo" && <Fluxo lojaId={filtroLoja} />}
      {aba === "contas" && <Contas lojaId={filtroLoja} lancs={lancs ?? []} />}

      {novo && (
        <NovoLanc
          lojaId={filtroLoja ?? lojas[0]?.id} tipoInicial={aba === "receber" ? "receber" : "pagar"} pessoas={pessoas}
          contas={contas.filter((c) => !filtroLoja || c.loja_id === filtroLoja)} plano={plano}
          onClose={() => setNovo(false)} onFeito={carregar}
        />
      )}
      {baixa && <BaixaDialog lanc={baixa} contas={contas.filter((c) => c.loja_id === baixa.loja_id)} onClose={() => setBaixa(null)} onFeito={carregar} />}
    </div>
  );
}

function ListaLanc(props: {
  tipo: "pagar" | "receber"; lancs: Lanc[] | null; status: "aberto" | "pago" | "todos"; setStatus: (s: "aberto" | "pago" | "todos") => void;
  de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void;
  nomePessoa: (id: string | null) => string; nomeConta: (id: string | null) => string; nomePlano: (id: string | null) => string;
  lojaNome?: (id: string) => string; onBaixar: (l: Lanc) => void; onCancelar: (l: Lanc) => void; onEstornar: (l: Lanc) => void;
}) {
  const { tipo, lancs, status } = props;
  const lista = useMemo(
    () => (lancs ?? []).filter((l) => l.tipo === tipo && (status === "todos" || l.status === status) && l.vencimento >= props.de && l.vencimento <= props.ate),
    [lancs, tipo, status, props.de, props.ate],
  );
  const hj = hoje();
  const vencidos = (lancs ?? []).filter((l) => l.tipo === tipo && l.status === "aberto" && l.vencimento < hj);
  const total = lista.reduce((s, l) => s + Number(l.status === "pago" ? l.valor_pago : l.valor), 0);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-sm text-muted-foreground">Total no filtro</div><div className="text-2xl font-bold">{fmtBRL(total)}</div><div className="text-xs text-muted-foreground">{lista.length} lançamentos</div></Card>
        <Card className={cn("p-4", vencidos.length && "border-destructive/40")}><div className="text-sm text-muted-foreground">Vencidos em aberto</div><div className={cn("text-2xl font-bold", vencidos.length && "text-destructive")}>{fmtBRL(vencidos.reduce((s, l) => s + Number(l.valor), 0))}</div><div className="text-xs text-muted-foreground">{vencidos.length} lançamentos</div></Card>
        <Card className="p-4 flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">Vencimento de</Label><Input type="date" value={props.de} onChange={(e) => props.setDe(e.target.value)} /></div>
          <div><Label className="text-xs">até</Label><Input type="date" value={props.ate} onChange={(e) => props.setAte(e.target.value)} /></div>
        </Card>
      </div>
      <div className="flex gap-1">
        {(["aberto", "pago", "todos"] as const).map((s) => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => props.setStatus(s)}>{s === "aberto" ? "Em aberto" : s === "pago" ? (tipo === "pagar" ? "Pagos" : "Recebidos") : "Todos"}</Button>)}
      </div>
      <div className="flex justify-end">
        <Exportar titulo={tipo === "pagar" ? "Contas a pagar" : "Contas a receber"} subtitulo={`vencimento ${props.de} a ${props.ate}`}
          colunas={[{ titulo: "Vencimento" }, { titulo: "Descrição" }, { titulo: tipo === "pagar" ? "Fornecedor" : "Cliente" }, { titulo: "Conta do plano" }, { titulo: "Valor (R$)", numero: true }, { titulo: "Situação" }, { titulo: "Pago em" }, { titulo: "Valor pago (R$)", numero: true }]}
          linhas={() => lista.map((l) => [dataBR(l.vencimento), l.descricao + (l.parcelas > 1 ? ` (${l.parcela}/${l.parcelas})` : ""), props.nomePessoa(l.pessoa_id), props.nomePlano(l.plano_conta_id), Number(l.valor), l.status, dataBR(l.data_pagamento), l.valor_pago != null ? Number(l.valor_pago) : null])} />
      </div>
      <Card className="p-4">
        {!lancs ? <Loader2 className="animate-spin text-muted-foreground" /> : lista.length === 0 ? <p className="text-sm text-muted-foreground">Nada neste filtro.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b"><th className="py-2 pr-2">Vencimento</th><th className="py-2 pr-2">Descrição</th>{props.lojaNome && <th className="py-2 pr-2">Loja</th>}<th className="py-2 pr-2">{tipo === "pagar" ? "Fornecedor" : "Cliente"}</th><th className="py-2 pr-2">Conta do plano</th><th className="py-2 pr-2 text-right">Valor</th><th className="py-2 pr-2">Situação</th><th></th></tr>
              </thead>
              <tbody>
                {lista.map((l) => {
                  const atrasado = l.status === "aberto" && l.vencimento < hj;
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className={cn("py-2 pr-2 whitespace-nowrap", atrasado && "text-destructive font-medium")}>{dataBR(l.vencimento)}</td>
                      <td className="py-2 pr-2"><div className="font-medium">{l.descricao}{l.parcelas > 1 ? ` (${l.parcela}/${l.parcelas})` : ""}</div>{l.documento && <div className="text-xs text-muted-foreground">Doc. {l.documento}</div>}</td>
                      {props.lojaNome && <td className="py-2 pr-2 text-xs">{props.lojaNome(l.loja_id)}</td>}
                      <td className="py-2 pr-2 text-xs">{props.nomePessoa(l.pessoa_id)}</td>
                      <td className="py-2 pr-2 text-xs">{props.nomePlano(l.plano_conta_id)}</td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap font-semibold">{fmtBRL(Number(l.valor))}{l.status === "pago" && Number(l.valor_pago) !== Number(l.valor) && <div className="text-xs font-normal">pago {fmtBRL(Number(l.valor_pago))}</div>}</td>
                      <td className="py-2 pr-2">
                        {l.status === "pago" ? <Badge variant="outline" className="text-success">{tipo === "pagar" ? "Pago" : "Recebido"} {dataBR(l.data_pagamento)}</Badge>
                          : atrasado ? <Badge variant="destructive">Vencido</Badge> : <Badge variant="secondary">Em aberto</Badge>}
                        {l.status === "pago" && <div className="text-xs text-muted-foreground">{props.nomeConta(l.conta_bancaria_id)}</div>}
                      </td>
                      <td className="py-2 whitespace-nowrap text-right">
                        {l.status === "aberto" && <Button size="sm" onClick={() => props.onBaixar(l)}>{tipo === "pagar" ? "Pagar" : "Receber"}</Button>}
                        {l.status === "pago" && <Button size="sm" variant="ghost" onClick={() => props.onEstornar(l)}>Estornar</Button>}
                        {l.status === "aberto" && l.origem === "manual" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => props.onCancelar(l)}>Cancelar</Button>}
                      </td>
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

function NovoLanc({ lojaId, tipoInicial, pessoas, contas, plano, onClose, onFeito }: {
  lojaId?: string; tipoInicial: "pagar" | "receber"; pessoas: Opcao[]; contas: Opcao[]; plano: Plano[]; onClose: () => void; onFeito: () => void;
}) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [descricao, setDescricao] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [planoId, setPlanoId] = useState("");
  const [conta, setConta] = useState("");
  const [valor, setValor] = useState("");
  const [venc, setVenc] = useState(hoje());
  const [parcelas, setParcelas] = useState("1");
  const [documento, setDocumento] = useState("");
  const [pago, setPago] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const pais = new Set(plano.map((p) => p.pai_id));
  const folhas = plano.filter((p) => !pais.has(p.id) && p.tipo === (tipo === "pagar" ? "despesa" : "receita"));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const v = lerNumero(valor);
    const n = Math.max(1, Math.min(60, Number(parcelas) || 1));
    if (!lojaId) return toast.error("Escolha a loja no menu.");
    if (!descricao.trim() || !v || v <= 0) return toast.error("Informe descrição e valor.");
    if (pago && !conta) return toast.error("Para lançar já pago, escolha a conta.");
    setSalvando(true);
    const porParcela = Math.floor((v / n) * 100) / 100;
    const linhas = Array.from({ length: n }, (_, i) => {
      const val = i === n - 1 ? Math.round((v - porParcela * (n - 1)) * 100) / 100 : porParcela;
      const vencimento = somarMeses(venc, i);
      const jaPago = pago && i === 0;
      return {
        loja_id: lojaId, tipo, descricao: descricao.trim(), pessoa_id: pessoa || null, plano_conta_id: planoId || null,
        conta_bancaria_id: conta || null, valor: val, vencimento, competencia: venc, documento: documento || null,
        parcela: i + 1, parcelas: n, status: jaPago ? "pago" : "aberto", data_pagamento: jaPago ? vencimento : null, valor_pago: jaPago ? val : null,
      };
    });
    const { error } = await supabase.from("lancamentos").insert(linhas);
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(n > 1 ? `${n} parcelas lançadas.` : "Lançamento criado.");
    onFeito();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo lançamento</DialogTitle><DialogDescription>Conta a pagar ou a receber, com parcelas.</DialogDescription></DialogHeader>
        <form onSubmit={salvar} className="space-y-3">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={tipo === "pagar" ? "default" : "outline"} onClick={() => { setTipo("pagar"); setPlanoId(""); }}>A pagar</Button>
            <Button type="button" size="sm" variant={tipo === "receber" ? "default" : "outline"} onClick={() => { setTipo("receber"); setPlanoId(""); }}>A receber</Button>
          </div>
          <div><Label className="text-xs">Descrição</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === "pagar" ? "Ex.: Aluguel novembro" : "Ex.: Venda a prazo"} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{tipo === "pagar" ? "Fornecedor" : "Cliente"} (opcional)</Label>
              <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">—</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Conta do plano</Label>
              <select value={planoId} onChange={(e) => setPlanoId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">—</option>{folhas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.nome}</option>)}
              </select>
            </div>
            <div><Label className="text-xs">Valor total (R$)</Label><Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" /></div>
            <div><Label className="text-xs">Parcelas (mensais)</Label><Input value={parcelas} onChange={(e) => setParcelas(e.target.value)} inputMode="numeric" /></div>
            <div><Label className="text-xs">1º vencimento</Label><Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></div>
            <div><Label className="text-xs">Nº documento (opcional)</Label><Input value={documento} onChange={(e) => setDocumento(e.target.value)} /></div>
            <div className="col-span-2">
              <Label className="text-xs">Conta bancária</Label>
              <select value={conta} onChange={(e) => setConta(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">—</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Já {tipo === "pagar" ? "paguei" : "recebi"} a 1ª parcela</label>
          <Button type="submit" disabled={salvando} className="w-full">{salvando ? <Loader2 className="animate-spin" /> : "Lançar"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BaixaDialog({ lanc, contas, onClose, onFeito }: { lanc: Lanc; contas: Opcao[]; onClose: () => void; onFeito: () => void }) {
  const [data, setData] = useState(hoje());
  const [valor, setValor] = useState(String(lanc.valor).replace(".", ","));
  const [conta, setConta] = useState(lanc.conta_bancaria_id ?? contas[0]?.id ?? "");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.rpc("baixar_lancamento", { _id: lanc.id, _data: data, _valor: lerNumero(valor), _conta: conta || null });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(lanc.tipo === "pagar" ? "Pagamento registrado." : "Recebimento registrado.");
    onFeito();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{lanc.tipo === "pagar" ? "Pagar" : "Receber"}</DialogTitle><DialogDescription>{lanc.descricao} · vence {dataBR(lanc.vencimento)}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div><Label className="text-xs">Valor (R$)</Label><Input value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">Conta bancária</Label>
            <select value={conta} onChange={(e) => setConta(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Escolha…</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {contas.length === 0 && <p className="mt-1 text-xs text-destructive">Cadastre uma conta em Cadastros → Contas bancárias.</p>}
          </div>
          <Button onClick={salvar} disabled={salvando} className="w-full">{salvando ? <Loader2 className="animate-spin" /> : "Confirmar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fluxo({ lojaId }: { lojaId: string | null }) {
  const [de, setDe] = useState(hoje());
  const [ate, setAte] = useState(somarMeses(hoje(), 1));
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [saldoInicial, setSaldoInicial] = useState(0);
  useEffect(() => {
    setDias(null);
    Promise.all([supabase.rpc("fluxo_caixa", { _loja_id: lojaId, _de: de, _ate: ate }), supabase.rpc("saldos_contas", { _loja_id: lojaId })]).then(([f, s]) => {
      if (f.error) return toast.error(f.error.message);
      setDias((f.data ?? []) as Dia[]);
      setSaldoInicial(((s.data ?? []) as Saldo[]).reduce((t, c) => t + Number(c.saldo), 0));
    });
  }, [lojaId, de, ate]);
  let acum = saldoInicial;
  const linhas = (dias ?? []).map((d) => {
    const mov = Number(d.entradas) + Number(d.entradas_previstas) - Number(d.saidas) - Number(d.saidas_previstas);
    acum += mov;
    return { ...d, mov, acum };
  }).filter((d) => d.mov !== 0);
  const tot = (k: keyof Dia) => (dias ?? []).reduce((s, d) => s + Number(d[k]), 0);
  return (
    <div className="space-y-3">
      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div><Label className="text-xs">De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">Realizado = já pago/recebido. Previsto = em aberto, pela data de vencimento. O saldo parte do saldo atual das contas.</p>
      </Card>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4"><div className="text-sm text-muted-foreground">Saldo atual nas contas</div><div className="text-2xl font-bold">{fmtBRL(saldoInicial)}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">Entradas (real + previsto)</div><div className="text-2xl font-bold text-success">{fmtBRL(tot("entradas") + tot("entradas_previstas"))}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">Saídas (real + previsto)</div><div className="text-2xl font-bold text-destructive">{fmtBRL(tot("saidas") + tot("saidas_previstas"))}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">Saldo projetado no fim</div><div className="text-2xl font-bold">{fmtBRL(saldoInicial + tot("entradas") + tot("entradas_previstas") - tot("saidas") - tot("saidas_previstas"))}</div></Card>
      </div>
      <div className="flex justify-end">
        <Exportar titulo="Fluxo de caixa" subtitulo={`${de} a ${ate}`}
          colunas={[{ titulo: "Dia" }, { titulo: "Entrou (R$)", numero: true }, { titulo: "Vai entrar (R$)", numero: true }, { titulo: "Saiu (R$)", numero: true }, { titulo: "Vai sair (R$)", numero: true }, { titulo: "Saldo (R$)", numero: true }]}
          linhas={() => linhas.map((d) => [dataBR(d.dia), Number(d.entradas), Number(d.entradas_previstas), Number(d.saidas), Number(d.saidas_previstas), d.acum])} />
      </div>
      <Card className="p-4">
        {!dias ? <Loader2 className="animate-spin text-muted-foreground" /> : linhas.length === 0 ? <p className="text-sm text-muted-foreground">Sem movimento no período.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Dia</th><th className="py-2 pr-2 text-right">Entrou</th><th className="py-2 pr-2 text-right">Vai entrar</th><th className="py-2 pr-2 text-right">Saiu</th><th className="py-2 pr-2 text-right">Vai sair</th><th className="py-2 pr-2 text-right">Saldo</th></tr></thead>
              <tbody>
                {linhas.map((d) => (
                  <tr key={d.dia} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">{dataBR(d.dia)}</td>
                    <td className="py-1.5 pr-2 text-right">{Number(d.entradas) ? fmtBRL(Number(d.entradas)) : ""}</td>
                    <td className="py-1.5 pr-2 text-right text-muted-foreground">{Number(d.entradas_previstas) ? fmtBRL(Number(d.entradas_previstas)) : ""}</td>
                    <td className="py-1.5 pr-2 text-right">{Number(d.saidas) ? fmtBRL(Number(d.saidas)) : ""}</td>
                    <td className="py-1.5 pr-2 text-right text-muted-foreground">{Number(d.saidas_previstas) ? fmtBRL(Number(d.saidas_previstas)) : ""}</td>
                    <td className={cn("py-1.5 pr-2 text-right font-semibold", d.acum < 0 && "text-destructive")}>{fmtBRL(d.acum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Contas({ lojaId, lancs }: { lojaId: string | null; lancs: Lanc[] }) {
  const [saldos, setSaldos] = useState<Saldo[] | null>(null);
  const [conta, setConta] = useState<string | null>(null);
  useEffect(() => {
    supabase.rpc("saldos_contas", { _loja_id: lojaId }).then(({ data, error }) => {
      if (error) return toast.error(error.message);
      setSaldos((data ?? []) as Saldo[]);
    });
  }, [lojaId, lancs.length]);
  const sel = saldos?.find((s) => s.conta_id === conta);
  const extrato = lancs.filter((l) => l.status === "pago" && l.conta_bancaria_id === conta).sort((a, b) => (a.data_pagamento ?? "").localeCompare(b.data_pagamento ?? ""));
  let corrido = Number(sel?.saldo_inicial ?? 0);
  return (
    <div className="space-y-3">
      <Card className="p-4">
        {!saldos ? <Loader2 className="animate-spin text-muted-foreground" /> : saldos.length === 0 ? <p className="text-sm text-muted-foreground">Cadastre contas em Cadastros → Contas bancárias.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Conta</th><th className="py-2 pr-2 text-right">Saldo inicial</th><th className="py-2 pr-2 text-right">Entradas</th><th className="py-2 pr-2 text-right">Saídas</th><th className="py-2 pr-2 text-right">Saldo</th><th></th></tr></thead>
            <tbody>
              {saldos.map((s) => (
                <tr key={s.conta_id} className={cn("border-b last:border-0", conta === s.conta_id && "bg-muted/40")}>
                  <td className="py-2 pr-2 font-medium">{s.nome}</td>
                  <td className="py-2 pr-2 text-right">{fmtBRL(Number(s.saldo_inicial))}</td>
                  <td className="py-2 pr-2 text-right text-success">{fmtBRL(Number(s.entradas))}</td>
                  <td className="py-2 pr-2 text-right text-destructive">{fmtBRL(Number(s.saidas))}</td>
                  <td className={cn("py-2 pr-2 text-right font-bold", Number(s.saldo) < 0 && "text-destructive")}>{fmtBRL(Number(s.saldo))}</td>
                  <td className="py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setConta(conta === s.conta_id ? null : s.conta_id)}>Extrato</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {sel && (
        <Card className="p-4 space-y-2">
          <h3 className="font-semibold">Extrato · {sel.nome}</h3>
          <p className="text-xs text-muted-foreground">Confira linha a linha com o extrato do banco (conciliação). O que não bater: lance o que faltou ou estorne o que está errado.</p>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b text-muted-foreground"><td className="py-1.5 pr-2" colSpan={2}>Saldo inicial</td><td className="py-1.5 text-right">{fmtBRL(corrido)}</td></tr>
              {extrato.map((l) => {
                const v = Number(l.valor_pago) * (l.tipo === "receber" ? 1 : -1);
                corrido += v;
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{dataBR(l.data_pagamento)}</td>
                    <td className="py-1.5 pr-2">{l.descricao}</td>
                    <td className={cn("py-1.5 pr-2 text-right whitespace-nowrap", v < 0 ? "text-destructive" : "text-success")}>{v < 0 ? "−" : "+"}{fmtBRL(Math.abs(v))}</td>
                    <td className="py-1.5 text-right whitespace-nowrap font-medium">{fmtBRL(corrido)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
