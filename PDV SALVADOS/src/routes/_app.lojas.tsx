import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLoja, type Loja } from "@/lib/loja";
import { buscarCnpj, cnpjValido, formatarDocumento, soDigitos, type DadosEmpresa } from "@/lib/documento";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DadosLoja } from "@/components/dados-loja";

export const Route = createFileRoute("/_app/lojas")({ component: PaginaLojas });

interface Perfil {
  id: string;
  nome: string;
  email: string;
}
interface LojaCompleta extends Loja {
  cnpj: string | null;
  razao_social: string | null;
  cidade: string | null;
  uf: string | null;
  tipo: "matriz" | "filial" | null;
  sistemas: string[];
  rede_id: string | null;
  redes: { nome: string } | null;
}
interface Rede { id: string; nome: string; ordem: number }

/** Empresas: redes do Grupo TB e as suas unidades (cada unidade tem o seu CNPJ; /0001 = matriz). Dados de cada unidade e equipe. */
function PaginaLojas() {
  const { role } = useAuth();
  const admin = role === "admin";
  const { recarregar } = useLoja();
  const [aba, setAba] = useState<"lojas" | "dados" | "equipe">("lojas");
  const [lojas, setLojas] = useState<LojaCompleta[] | null>(null);
  const [outras, setOutras] = useState<LojaCompleta[]>([]);
  const [redes, setRedes] = useState<Rede[]>([]);
  const [redeNova, setRedeNova] = useState("");
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [vinculos, setVinculos] = useState<Set<string>>(new Set());
  // nova loja
  const [cnpj, setCnpj] = useState("");
  const [achado, setAchado] = useState<DadosEmpresa | null>(null);
  const [nome, setNome] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const [l, p, v, r, o] = await Promise.all([
      supabase.from("lojas").select("*, redes(nome)").contains("sistemas", ["pdv"]).order("nome"),
      supabase.from("profiles").select("id, nome, email").order("nome"),
      supabase.from("usuario_lojas").select("user_id, loja_id"),
      supabase.from("redes").select("id, nome, ordem").eq("ativo", true).order("ordem"),
      // unidades de outros sistemas (ex.: Supermix, só Gestão RH): só para consulta aqui
      supabase.from("lojas").select("*, redes(nome)").not("sistemas", "cs", "{pdv}").order("nome"),
    ]);
    if (l.error) return toast.error("Não foi possível carregar as empresas: " + l.error.message);
    setLojas((l.data ?? []) as LojaCompleta[]);
    setRedes((r.data ?? []) as Rede[]);
    setOutras((o.data ?? []) as LojaCompleta[]);
    setPerfis((p.data ?? []) as Perfil[]);
    setVinculos(new Set((v.data ?? []).map((x) => `${x.user_id}|${x.loja_id}`)));
  }
  useEffect(() => {
    carregar();
  }, []);

  const dig = soDigitos(cnpj);

  async function pesquisar() {
    setBuscando(true);
    try {
      const e = await buscarCnpj(dig);
      setAchado(e);
      setNome(e.nome_fantasia || e.nome);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  async function criar() {
    if (!nome.trim()) return toast.error("Informe o nome da unidade no sistema.");
    if (dig && !cnpjValido(dig)) return toast.error("CNPJ inválido.");
    setSalvando(true);
    const e = achado;
    const { error } = await supabase.from("lojas").insert({
      nome: nome.trim(),
      rede_id: redeNova || null,
      cnpj: dig || null,
      razao_social: e?.nome ?? null,
      nome_fantasia: e?.nome_fantasia ?? null,
      email: e?.email ?? null,
      telefone: e?.telefone ?? null,
      cep: e?.cep ?? null,
      logradouro: e?.logradouro ?? null,
      numero: e?.numero ?? null,
      complemento: e?.complemento ?? null,
      bairro: e?.bairro ?? null,
      cidade: e?.cidade ?? null,
      uf: e?.uf ?? null,
      cod_ibge: e?.cod_ibge ?? null,
      situacao_cadastral: e?.situacao_cadastral ?? null,
      atividade: e?.atividade ?? null,
    });
    setSalvando(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "Já existe uma unidade com esse nome ou CNPJ." : error.message);
    toast.success(`Unidade ${nome.trim()} criada. Marque quem trabalha nela na aba Equipe.`);
    setCnpj(""); setAchado(null); setNome("");
    await carregar();
    recarregar();
  }

  async function alternarAtivo(l: Loja) {
    const { error } = await supabase.from("lojas").update({ ativo: !l.ativo }).eq("id", l.id);
    if (error) return toast.error(error.message);
    await carregar();
    recarregar();
  }

  async function alternarVinculo(userId: string, lojaId: string) {
    const chave = `${userId}|${lojaId}`;
    const tem = vinculos.has(chave);
    const { error } = tem
      ? await supabase.from("usuario_lojas").delete().eq("user_id", userId).eq("loja_id", lojaId)
      : await supabase.from("usuario_lojas").insert({ user_id: userId, loja_id: lojaId });
    if (error) return toast.error(error.message);
    setVinculos((s) => {
      const n = new Set(s);
      if (tem) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }

  if (!lojas) return <div className="p-6"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Empresas</h1>
        <p className="text-sm text-muted-foreground">Cada empresa (rede) tem as suas unidades. Cada unidade tem o seu CNPJ (final /0001 = matriz; outro final = filial) e as suas vendas, caixa e estoque.</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b pb-2">
        <Button size="sm" variant={aba === "lojas" ? "default" : "ghost"} onClick={() => setAba("lojas")}>Redes e unidades</Button>
        <Button size="sm" variant={aba === "dados" ? "default" : "ghost"} onClick={() => setAba("dados")}>Dados da unidade</Button>
        {admin && <Button size="sm" variant={aba === "equipe" ? "default" : "ghost"} onClick={() => setAba("equipe")}>Equipe por unidade</Button>}
      </div>

      {aba === "dados" && <DadosLoja />}

      {aba === "lojas" && (
        <>
          {admin && (
            <Card className="p-4 space-y-3">
              <h2 className="font-semibold">Nova unidade pelo CNPJ</h2>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-60"><Label className="text-xs">CNPJ</Label><Input value={cnpj} onChange={(e) => { setCnpj(formatarDocumento(e.target.value)); setAchado(null); }} inputMode="numeric" /></div>
                <Button variant="outline" onClick={pesquisar} disabled={buscando || dig.length !== 14}>{buscando ? <Loader2 className="animate-spin" /> : <Search />} Pesquisar</Button>
              </div>
              {achado && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-0.5">
                  <div className="font-semibold">{achado.nome}</div>
                  {achado.nome_fantasia && <div>Fantasia: {achado.nome_fantasia}</div>}
                  <div className="text-muted-foreground">{[achado.logradouro, achado.numero, achado.bairro, achado.cidade && `${achado.cidade}/${achado.uf}`].filter(Boolean).join(", ")}</div>
                  {achado.situacao_cadastral && <div className="text-xs">Receita: {achado.situacao_cadastral}</div>}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-48"><Label className="text-xs">Nome da unidade no sistema</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Eldorado" /></div>
                <div className="w-56">
                  <Label className="text-xs">Empresa (rede)</Label>
                  <select value={redeNova} onChange={(e) => setRedeNova(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">escolha…</option>
                    {redes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                  </select>
                </div>
                <Button onClick={criar} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <Plus />} Criar unidade</Button>
              </div>
              <p className="text-xs text-muted-foreground">Sem CNPJ? Dá para criar só com o nome e completar depois em "Dados da loja".</p>
            </Card>
          )}
          {[...new Set(lojas.map((l) => l.redes?.nome ?? ""))].sort((x, y) => (x || "~").localeCompare(y || "~")).map((rede) => (
            <Card key={rede || "sem-rede"} className="p-4">
              <h2 className="mb-2 font-semibold uppercase tracking-wide">{rede || "Sem empresa (rede)"}</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Unidade</th><th className="py-2 pr-2">Tipo</th><th className="py-2 pr-2">CNPJ</th><th className="py-2 pr-2">Cidade</th><th className="py-2 pr-2">Situação</th><th></th></tr></thead>
                <tbody>
                  {lojas.filter((l) => (l.redes?.nome ?? "") === rede).map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-2"><div className="font-medium">{l.nome}</div>{l.razao_social && <div className="text-xs text-muted-foreground">{l.razao_social}</div>}</td>
                      <td className="py-2 pr-2">{l.tipo === "matriz" ? "Matriz" : l.tipo === "filial" ? "Filial" : <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">{l.cnpj ? formatarDocumento(l.cnpj) : <span className="text-warning">sem CNPJ</span>}</td>
                      <td className="py-2 pr-2">{l.cidade ? `${l.cidade}/${l.uf ?? ""}` : "—"}</td>
                      <td className="py-2 pr-2">{l.ativo ? "Ativa" : <span className="text-destructive">Desativada</span>}</td>
                      <td className="py-2 text-right">{admin && <Button size="sm" variant="ghost" onClick={() => alternarAtivo(l)}>{l.ativo ? "Desativar" : "Reativar"}</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
          {outras.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-1 font-semibold uppercase tracking-wide">Unidades de outros sistemas</h2>
              <p className="mb-2 text-xs text-muted-foreground">Não aparecem no PDV. Nome, CNPJ e acessos serão cuidados no Portal (em breve).</p>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Empresa (rede)</th><th className="py-2 pr-2">Unidade</th><th className="py-2 pr-2">Tipo</th><th className="py-2 pr-2">CNPJ</th><th className="py-2 pr-2">Sistema</th></tr></thead>
                <tbody>
                  {outras.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">{l.redes?.nome ?? "—"}</td>
                      <td className="py-2 pr-2 font-medium">{l.nome}</td>
                      <td className="py-2 pr-2">{l.tipo === "matriz" ? "Matriz" : l.tipo === "filial" ? "Filial" : "—"}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">{l.cnpj ? formatarDocumento(l.cnpj) : <span className="text-muted-foreground">sem CNPJ</span>}</td>
                      <td className="py-2 pr-2">{l.sistemas.map((x) => (x === "rh" ? "Gestão RH" : x)).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {aba === "equipe" && admin && (
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Quem trabalha em cada loja</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Usuário</th>
                  {lojas.filter((l) => l.ativo).map((l) => <th key={l.id} className="py-2 px-2 text-center whitespace-nowrap">{l.nome}</th>)}
                </tr>
              </thead>
              <tbody>
                {perfis.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-3"><div className="font-medium">{p.nome}</div><div className="text-xs text-muted-foreground">{p.email}</div></td>
                    {lojas.filter((l) => l.ativo).map((l) => (
                      <td key={l.id} className="py-2 px-2 text-center">
                        <input type="checkbox" className="size-4 accent-primary" checked={vinculos.has(`${p.id}|${l.id}`)} onChange={() => alternarVinculo(p.id, l.id)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Admin vê todas as lojas mesmo sem marcação. Usuários novos entram na Matriz automaticamente.</p>
        </Card>
      )}
    </div>
  );
}
