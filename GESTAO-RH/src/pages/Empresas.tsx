// EMPRESAS – cadastro SIMPLES de filiais (só o admin mexe).
// Cada empresa é um bloco; dentro, uma linha por filial: [flag] NOME · MATRIZ/FILIAL · CNPJ, com EDITAR e EXCLUIR.
//  * FLAG marcado = a filial aparece nos resultados (coluna no Painel e na Visão Global).
//    Desmarcado = some dos resultados, mas o histórico fica guardado e volta ao marcar.
//  * + ADICIONAR FILIAL (dentro do bloco): nome e CNPJ (CNPJ pode ficar para depois). Já entra marcada.
//  * Matriz/Filial sai sozinho pelo CNPJ (/0001 = matriz).
//  * + NOVA EMPRESA (separado): só para empresa nova.
// Banco: rh.lojas_da_empresa, rh.mostrar_loja, rh.adicionar_loja, rh.editar_loja, rh.excluir_loja, rh.nova_empresa (migrations 0019 e 0020).
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useEmpresa } from "../contexts/EmpresaContext";
import { useTelas } from "../contexts/TelasContext";
import { PAPEL_LABEL, type EmpresaComPapel } from "../lib/types";
import { Aviso, Card } from "../components/ui";

interface Filial {
  id: string;
  codigo: string;
  nome: string;
  ordem: number;
  cnpj: string | null;
  tipo: "matriz" | "filial" | null;
  mostrar: boolean;
  pode_excluir: boolean;
}

const digitos = (s: string) => s.replace(/\D/g, "");
function mascaraCnpj(v: string) {
  const d = digitos(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
const tipoPeloCnpj = (cnpj: string) => (digitos(cnpj).length === 14 ? (digitos(cnpj).slice(8, 12) === "0001" ? "MATRIZ" : "FILIAL") : "");
const msg = (e: { message?: string } | null) => (e?.message ?? "Erro inesperado").replace(/^.*?: /, "");

const BTN = "font-bold uppercase tracking-wide";

export default function Empresas() {
  const { empresas, carregando, recarregar, selecionar } = useEmpresa();
  const { admin } = useTelas();
  const [novaAberta, setNovaAberta] = useState(false);
  const navigate = useNavigate();

  if (carregando) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide">Empresas</h1>
          <p className="text-sm text-muted-foreground">Cada empresa tem as suas filiais. Cada filial é uma coluna no Painel e na Visão Global.</p>
        </div>
        {admin && !novaAberta && (
          <button className={`btn-primario ${BTN}`} onClick={() => setNovaAberta(true)}>+ Nova empresa</button>
        )}
      </div>

      {admin && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <b className="uppercase">+ Nova empresa:</b> use só para uma empresa nova. Para loja da mesma empresa, use <b className="uppercase">+ Adicionar filial</b> dentro do bloco dela.
        </p>
      )}

      {admin && novaAberta && (
        <NovaEmpresa
          onCancelar={() => setNovaAberta(false)}
          onCriada={async (id) => { await recarregar(); selecionar(id); setNovaAberta(false); }}
        />
      )}

      {empresas.length === 0 && (
        <Card titulo="Nenhuma empresa">
          <p className="text-sm text-muted-foreground">
            {admin ? "Cadastre a primeira empresa em + NOVA EMPRESA." : "Você ainda não foi incluído em nenhuma empresa. Só o administrador cadastra empresas e libera acessos: peça a ele."}
          </p>
        </Card>
      )}

      {empresas.map((e) => (
        <BlocoEmpresa key={e.id} empresa={e} admin={admin} onAbrir={() => { selecionar(e.id); navigate("/"); }} onMudou={recarregar} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Bloco de uma empresa: filiais com flag, editar, excluir e + ADICIONAR FILIAL
// ---------------------------------------------------------------------
function BlocoEmpresa({ empresa, admin, onAbrir, onMudou }: { empresa: EmpresaComPapel; admin: boolean; onAbrir: () => void; onMudou: () => Promise<void> }) {
  const [filiais, setFiliais] = useState<Filial[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [edNome, setEdNome] = useState("");
  const [edCnpj, setEdCnpj] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoCnpj, setNovoCnpj] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [config, setConfig] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("lojas_da_empresa", { p_empresa: empresa.id });
    if (error) {
      setErro(error.message.includes("lojas_da_empresa") || error.code === "PGRST202"
        ? "O cadastro de filiais ainda não está ativo no banco (falta aplicar as migrations 0019 e 0020)."
        : error.message);
      setFiliais([]);
      return;
    }
    setFiliais((data as Filial[]) ?? []);
  }, [empresa.id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function rodar(fn: () => PromiseLike<{ error: { message?: string } | null }>, sucesso: string) {
    setErro(null); setOk(null); setOcupado(true);
    const { error } = await fn();
    setOcupado(false);
    if (error) { setErro(msg(error)); return false; }
    setOk(sucesso);
    await carregar();
    await onMudou();
    return true;
  }

  const alternar = (f: Filial) =>
    rodar(() => supabase.rpc("mostrar_loja", { p_loja: f.id, p_mostrar: !f.mostrar }),
      f.mostrar ? `${f.nome} saiu dos resultados (o histórico continua guardado).` : `${f.nome} voltou para os resultados.`);

  async function salvarEdicao(f: Filial) {
    if (!edNome.trim()) return setErro("Informe o nome da filial.");
    if (edCnpj && digitos(edCnpj).length !== 14) return setErro("CNPJ precisa ter 14 números (ou deixe em branco).");
    if (await rodar(() => supabase.rpc("editar_loja", { p_loja: f.id, p_nome: edNome.trim(), p_cnpj: digitos(edCnpj) || null }), "Filial salva.")) setEditando(null);
  }

  async function excluir(f: Filial) {
    if (!f.pode_excluir) return setErro("Não pode excluir, já tem histórico. Desmarque a filial para tirá-la dos resultados.");
    if (!confirm(`Excluir a filial ${f.nome}?\n\nTem certeza? Não dá para desfazer.`)) return;
    await rodar(() => supabase.rpc("excluir_loja", { p_loja: f.id }), `Filial ${f.nome} excluída.`);
  }

  async function adicionar(ev: FormEvent) {
    ev.preventDefault();
    if (!novoNome.trim()) return setErro("Informe o nome da filial.");
    if (novoCnpj && digitos(novoCnpj).length !== 14) return setErro("CNPJ precisa ter 14 números (ou deixe em branco para preencher depois).");
    if (await rodar(() => supabase.rpc("adicionar_loja", { p_empresa: empresa.id, p_nome: novoNome.trim(), p_cnpj: digitos(novoCnpj) || null }),
      `Filial ${novoNome.trim()} adicionada. Ela já aparece no Painel e na Visão Global.`)) {
      setNovoNome(""); setNovoCnpj(""); setAdicionando(false);
    }
  }

  return (
    <Card
      titulo={<span className="text-base text-foreground">{empresa.nome}</span>}
      acoes={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Seu perfil: {PAPEL_LABEL[empresa.papel]}</span>
          <button className={`btn-secundario ${BTN} text-xs`} onClick={onAbrir}>Abrir</button>
          {admin && <button className={`btn-secundario ${BTN} text-xs`} onClick={() => setConfig((v) => !v)}>{config ? "Fechar configuração" : "Configurar"}</button>}
        </div>
      }
    >
      {config && admin && <ConfigEmpresa empresa={empresa} onSalva={async () => { await onMudou(); setConfig(false); }} />}

      {filiais === null ? (
        <p className="text-sm text-muted-foreground">Carregando filiais...</p>
      ) : (
        <div className="divide-y divide-border">
          {filiais.map((f) => (
            <div key={f.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${f.mostrar ? "" : "opacity-60"}`}>
              {admin && (
                <input
                  type="checkbox"
                  className="size-5 cursor-pointer accent-[rgb(var(--primary))]"
                  checked={f.mostrar}
                  disabled={ocupado}
                  onChange={() => alternar(f)}
                  title={f.mostrar ? "Marcado: aparece nos resultados. Clique para tirar dos resultados." : "Desmarcado: fora dos resultados. Clique para voltar."}
                  aria-label={`Mostrar ${f.nome} nos resultados`}
                />
              )}
              {editando === f.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <input className="campo min-w-48 flex-1" value={edNome} onChange={(e) => setEdNome(e.target.value)} placeholder="Nome da filial" />
                  <input className="campo w-52" value={edCnpj} onChange={(e) => setEdCnpj(mascaraCnpj(e.target.value))} placeholder="CNPJ (opcional)" inputMode="numeric" />
                  <span className="w-16 text-xs font-bold uppercase text-muted-foreground">{tipoPeloCnpj(edCnpj)}</span>
                  <button className={`btn-primario ${BTN} text-xs`} disabled={ocupado} onClick={() => salvarEdicao(f)}>Salvar</button>
                  <button className={`btn-secundario ${BTN} text-xs`} onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              ) : (
                <>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-semibold">{f.nome}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className={`text-xs font-bold uppercase ${f.tipo === "matriz" ? "text-primary" : "text-muted-foreground"}`}>{f.tipo === "matriz" ? "Matriz" : f.tipo === "filial" ? "Filial" : "Sem CNPJ"}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="tabular-nums text-muted-foreground">{f.cnpj ? mascaraCnpj(f.cnpj) : "CNPJ a preencher"}</span>
                    {!f.mostrar && <span className="text-xs text-muted-foreground">(fora dos resultados)</span>}
                  </div>
                  {admin && (
                    <div className="flex gap-1">
                      <button className={`btn-secundario ${BTN} text-xs`} onClick={() => { setEditando(f.id); setEdNome(f.nome); setEdCnpj(f.cnpj ? mascaraCnpj(f.cnpj) : ""); setErro(null); setOk(null); }}>Editar</button>
                      {f.pode_excluir && <button className={`btn-secundario ${BTN} text-xs text-danger`} disabled={ocupado} onClick={() => excluir(f)}>Excluir</button>}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {admin && filiais !== null && !erro?.includes("migrations") && (
        adicionando ? (
          <form onSubmit={adicionar} className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
            <input className="campo min-w-48 flex-1" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome da filial (ex.: SUPER MIX BRAZ 05)" autoFocus />
            <input className="campo w-52" value={novoCnpj} onChange={(e) => setNovoCnpj(mascaraCnpj(e.target.value))} placeholder="CNPJ (opcional)" inputMode="numeric" />
            <span className="w-16 text-xs font-bold uppercase text-muted-foreground">{tipoPeloCnpj(novoCnpj)}</span>
            <button className={`btn-primario ${BTN} text-xs`} disabled={ocupado}>Salvar</button>
            <button type="button" className={`btn-secundario ${BTN} text-xs`} onClick={() => { setAdicionando(false); setNovoNome(""); setNovoCnpj(""); }}>Cancelar</button>
          </form>
        ) : (
          <button className={`btn-secundario ${BTN} mt-3`} onClick={() => { setAdicionando(true); setErro(null); setOk(null); }}>+ Adicionar filial</button>
        )
      )}

      {admin && filiais !== null && filiais.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">✓ marcado = aparece nos resultados (Painel e Visão Global). Desmarcado = some dos resultados; o histórico fica guardado e volta ao marcar.</p>
      )}
      {erro && <div className="mt-3"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mt-3"><Aviso tipo="ok">{ok}</Aviso></div>}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Configuração da empresa: nome, % de Gastos Extras e faixas do indicador
// ---------------------------------------------------------------------
function ConfigEmpresa({ empresa, onSalva }: { empresa: EmpresaComPapel; onSalva: () => void }) {
  const [f, setF] = useState({ nome: empresa.nome, pct_extras: String(empresa.pct_extras), meta_otimo: String(empresa.meta_otimo), meta_alerta: String(empresa.meta_alerta) });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const num = (s: string) => Number(String(s).replace(",", "."));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f.nome.trim()) return setErro("Informe o nome da empresa.");
    if ([f.pct_extras, f.meta_otimo, f.meta_alerta].some((x) => !Number.isFinite(num(x)) || num(x) < 0)) return setErro("Use números válidos nos percentuais.");
    if (num(f.meta_otimo) >= num(f.meta_alerta)) return setErro("A meta ÓTIMO precisa ser menor que a de ALERTA.");
    setSalvando(true);
    const { error } = await supabase.from("empresas").update({ nome: f.nome.trim(), pct_extras: num(f.pct_extras), meta_otimo: num(f.meta_otimo), meta_alerta: num(f.meta_alerta) }).eq("id", empresa.id);
    setSalvando(false);
    if (error) return setErro(error.message);
    onSalva();
  }

  return (
    <form onSubmit={salvar} className="mb-4 grid gap-3 rounded-md border border-border p-3 sm:grid-cols-4">
      <label className="text-sm sm:col-span-4">Nome da empresa<input className="campo mt-1" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
      <label className="text-sm">Gastos Extras (%)<input className="campo mt-1" inputMode="decimal" value={f.pct_extras} onChange={(e) => setF({ ...f, pct_extras: e.target.value })} /></label>
      <label className="text-sm">ÓTIMO abaixo de (%)<input className="campo mt-1" inputMode="decimal" value={f.meta_otimo} onChange={(e) => setF({ ...f, meta_otimo: e.target.value })} /></label>
      <label className="text-sm">ALERTA a partir de (%)<input className="campo mt-1" inputMode="decimal" value={f.meta_alerta} onChange={(e) => setF({ ...f, meta_alerta: e.target.value })} /></label>
      <div className="flex items-end"><button className={`btn-primario w-full ${BTN} text-xs`} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button></div>
      {erro && <div className="sm:col-span-4"><Aviso>{erro}</Aviso></div>}
    </form>
  );
}

// ---------------------------------------------------------------------
// + NOVA EMPRESA (só para empresa nova)
// ---------------------------------------------------------------------
function NovaEmpresa({ onCriada, onCancelar }: { onCriada: (id: string) => void; onCancelar: () => void }) {
  const [nome, setNome] = useState("");
  const [lojaNome, setLojaNome] = useState("");
  const [lojaCnpj, setLojaCnpj] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return setErro("Informe o nome da empresa.");
    if (lojaCnpj && digitos(lojaCnpj).length !== 14) return setErro("CNPJ precisa ter 14 números (ou deixe em branco).");
    setSalvando(true);
    const { data, error } = await supabase.rpc("nova_empresa", { p_nome: nome.trim(), p_loja_nome: lojaNome.trim() || nome.trim(), p_loja_cnpj: digitos(lojaCnpj) || null });
    setSalvando(false);
    if (error) return setErro(msg(error));
    onCriada(data as string);
  }

  return (
    <Card titulo={<span className="uppercase">Nova empresa</span>}>
      <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
        Use só para uma <b>empresa nova</b>. Para loja da mesma empresa, cancele e use <b className="uppercase">+ Adicionar filial</b> dentro do bloco dela.
      </p>
      <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Nome da empresa<input className="campo mt-1" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Supermix Braz" autoFocus /></label>
        <label className="text-sm">Primeira loja (nome)<input className="campo mt-1" value={lojaNome} onChange={(e) => setLojaNome(e.target.value)} placeholder="Ex.: SUPER MIX BRAZ 01" /></label>
        <label className="text-sm">CNPJ da primeira loja (opcional) <span className="text-xs font-bold uppercase text-muted-foreground">{tipoPeloCnpj(lojaCnpj)}</span>
          <input className="campo mt-1" value={lojaCnpj} onChange={(e) => setLojaCnpj(mascaraCnpj(e.target.value))} inputMode="numeric" placeholder="00.000.000/0001-00" />
        </label>
        {erro && <div className="sm:col-span-2"><Aviso>{erro}</Aviso></div>}
        <div className="flex gap-2 sm:col-span-2">
          <button className={`btn-primario ${BTN}`} disabled={salvando}>{salvando ? "Salvando..." : "Criar empresa"}</button>
          <button type="button" className={`btn-secundario ${BTN}`} onClick={onCancelar}>Cancelar</button>
        </div>
      </form>
    </Card>
  );
}
