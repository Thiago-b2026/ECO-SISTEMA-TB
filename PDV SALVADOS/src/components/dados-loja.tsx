// Dados cadastrais da loja (filial), preenchidos pelo CNPJ.
import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/lib/loja";
import { buscarCep, buscarCnpj, cnpjValido, formatarDocumento, soDigitos } from "@/lib/documento";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Dados = Record<string, string | null>;
const CAMPOS = ["razao_social", "nome_fantasia", "ie", "im", "regime_tributario", "email", "telefone", "cep", "logradouro", "numero",
  "complemento", "bairro", "cidade", "uf", "cod_ibge", "situacao_cadastral", "atividade"] as const;

export function DadosLoja() {
  const { lojas, filtroLoja, recarregar } = useLoja();
  const [lojaId, setLojaId] = useState(filtroLoja ?? lojas[0]?.id ?? "");
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [d, setD] = useState<Dados>({});
  const [carregando, setCarregando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!lojaId && lojas[0]) setLojaId(filtroLoja ?? lojas[0].id);
  }, [lojas]);
  useEffect(() => {
    if (!lojaId) return;
    setCarregando(true);
    supabase.from("lojas").select("*").eq("id", lojaId).single().then(({ data }) => {
      setCarregando(false);
      if (!data) return;
      setNome(data.nome);
      setCnpj(data.cnpj ? formatarDocumento(data.cnpj) : "");
      setD(Object.fromEntries(CAMPOS.map((k) => [k, data[k] ?? null])));
    });
  }, [lojaId]);

  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v || null }));
  const dig = soDigitos(cnpj);

  async function pesquisar() {
    setBuscando(true);
    try {
      const e = await buscarCnpj(dig);
      setD((x) => ({ ...x, ...Object.fromEntries(Object.entries(e).filter(([k, v]) => k !== "nome" && v)), razao_social: e.nome }));
      if (e.nome_fantasia && !nome) setNome(e.nome_fantasia);
      toast.success("Dados da Receita preenchidos. Confira e salve.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  async function pesquisarCep() {
    try {
      const e = await buscarCep(d.cep ?? "");
      setD((x) => ({ ...x, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v)) }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function salvar() {
    if (dig && !cnpjValido(dig)) return toast.error("CNPJ inválido.");
    if (!nome.trim()) return toast.error("Informe o nome da loja (como aparece no sistema).");
    setSalvando(true);
    const { error } = await supabase.from("lojas").update({ ...d, nome: nome.trim(), cnpj: dig || null, uf: d.uf ? d.uf.toUpperCase() : null }).eq("id", lojaId);
    setSalvando(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "Esse CNPJ (ou nome) já está em outra loja." : error.message);
    toast.success("Dados da loja salvos.");
    recarregar();
  }

  const campo = (k: (typeof CAMPOS)[number], label: string, className = "") => (
    <div className={className}><Label className="text-xs">{label}</Label><Input value={d[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></div>
  );

  return (
    <Card className="p-5 space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">Loja</Label>
          <select value={lojaId} onChange={(e) => setLojaId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        {carregando && <Loader2 className="animate-spin text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground">
        Cada loja tem o seu CNPJ. Vendas, caixa e estoque ficam separados por loja; em "Todas as lojas" você só consulta os números juntos.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-60"><Label className="text-xs">CNPJ da loja</Label><Input value={cnpj} onChange={(e) => setCnpj(formatarDocumento(e.target.value))} inputMode="numeric" /></div>
        <Button variant="outline" onClick={pesquisar} disabled={buscando || dig.length !== 14}>{buscando ? <Loader2 className="animate-spin" /> : <Search />} Pesquisar CNPJ</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label className="text-xs">Nome da loja no sistema</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        {campo("nome_fantasia", "Nome fantasia")}
        {campo("razao_social", "Razão social", "sm:col-span-2")}
        {campo("ie", "Inscrição estadual")}
        {campo("im", "Inscrição municipal")}
        <div>
          <Label className="text-xs">Regime tributário</Label>
          <select value={d.regime_tributario ?? ""} onChange={(e) => set("regime_tributario", e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">—</option>
            <option value="mei">MEI</option>
            <option value="simples">Simples Nacional</option>
            <option value="simples_excesso">Simples Nacional – excesso de sublimite</option>
            <option value="presumido">Lucro Presumido</option>
            <option value="real">Lucro Real</option>
          </select>
        </div>
        {campo("telefone", "Telefone")}
        {campo("email", "E-mail")}
        {d.situacao_cadastral && <div className="text-xs text-muted-foreground self-end">Receita: {d.situacao_cadastral}{d.atividade ? ` · ${d.atividade}` : ""}</div>}
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-end gap-2">
          <div className="w-40"><Label className="text-xs">CEP</Label><Input value={d.cep ?? ""} onChange={(e) => set("cep", soDigitos(e.target.value).slice(0, 8))} /></div>
          <Button type="button" variant="outline" size="sm" onClick={pesquisarCep} disabled={soDigitos(d.cep ?? "").length !== 8}><Search /> Buscar CEP</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-6">
          {campo("logradouro", "Rua / Avenida", "sm:col-span-4")}
          {campo("numero", "Número", "sm:col-span-2")}
          {campo("complemento", "Complemento", "sm:col-span-2")}
          {campo("bairro", "Bairro", "sm:col-span-2")}
          {campo("cidade", "Cidade", "sm:col-span-1")}
          {campo("uf", "UF", "sm:col-span-1")}
        </div>
      </div>
      <Button onClick={salvar} disabled={salvando || !lojaId}>{salvando ? <Loader2 className="animate-spin" /> : "Salvar dados da loja"}</Button>
    </Card>
  );
}
