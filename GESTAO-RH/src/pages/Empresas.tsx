import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTelas } from "../contexts/TelasContext";
import { supabase } from "../lib/supabase";
import { useEmpresa } from "../contexts/EmpresaContext";
import { PAPEL_LABEL, type EmpresaComPapel, type Loja } from "../lib/types";
import { Aviso, Card } from "../components/ui";

export default function Empresas() {
  const { carregando } = useEmpresa();
  if (carregando) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  return <EmpresasConteudo />;
}

function EmpresasConteudo() {
  const { empresas, empresa, selecionar, recarregar } = useEmpresa();
  const { admin } = useTelas();
  const [params] = useSearchParams();
  const [criando, setCriando] = useState(admin && (params.get("nova") === "1" || empresas.length === 0));
  const [editando, setEditando] = useState<EmpresaComPapel | null>(null);
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Empresas</h1>
          <p className="text-sm text-muted-foreground">Cada empresa tem suas lojas, usuários e lançamentos separados.</p>
        </div>
        {admin && !criando && <button className="btn-primario" onClick={() => { setCriando(true); setEditando(null); }}>+ Nova empresa</button>}
      </div>

      {!admin && empresas.length === 0 && (
        <Card titulo="Nenhuma empresa">
          <p className="text-sm text-muted-foreground">Você ainda não foi incluído em nenhuma empresa. Só o administrador cadastra empresas e libera acessos: peça a ele.</p>
        </Card>
      )}

      {admin && criando && (
        <NovaEmpresa
          podeCancelar={empresas.length > 0}
          onCancelar={() => setCriando(false)}
          onCriada={async (id) => {
            await recarregar();
            selecionar(id);
            setCriando(false);
            navigate("/");
          }}
        />
      )}

      {editando && (
        <EditarEmpresa
          empresa={editando}
          onFechar={() => setEditando(null)}
          onSalva={async () => {
            await recarregar();
            setEditando(null);
          }}
        />
      )}

      {empresas.length > 0 && (
        <Card titulo="Minhas empresas">
          <div className="divide-y divide-border">
            {empresas.map((e) => (
              <div key={e.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {e.nome} {empresa?.id === e.id && <span className="ml-2 text-[11px] rounded bg-primary/15 text-primary px-2 py-0.5">selecionada</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.cnpj ? `CNPJ ${e.cnpj} • ` : ""}Seu perfil: {PAPEL_LABEL[e.papel]}
                  </div>
                </div>
                <div className="flex gap-2">
                  {empresa?.id !== e.id && (
                    <button className="btn-secundario" onClick={() => { selecionar(e.id); navigate("/"); }}>Abrir</button>
                  )}
                  {(e.papel === "owner" || e.papel === "admin") && (
                    <button className="btn-secundario" onClick={() => { setEditando(e); setCriando(false); }}>Configurar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function NovaEmpresa({ onCriada, onCancelar, podeCancelar }: { onCriada: (id: string) => void; onCancelar: () => void; podeCancelar: boolean }) {
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [lojas, setLojas] = useState<string[]>(["Loja 1"]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const { data, error } = await supabase.rpc("criar_empresa", {
      p_nome: nome,
      p_cnpj: cnpj,
      p_lojas: lojas.map((l) => l.trim()).filter(Boolean),
    });
    setSalvando(false);
    if (error) return setErro(error.message);
    onCriada(data as string);
  }

  return (
    <Card titulo="Cadastrar nova empresa">
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Nome da empresa
            <input className="campo mt-1" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Supermix Braz" required />
          </label>
          <label className="text-sm">
            CNPJ (opcional)
            <input className="campo mt-1" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
          </label>
        </div>
        <div>
          <div className="text-sm mb-2">Lojas / unidades</div>
          <div className="space-y-2">
            {lojas.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="campo"
                  value={l}
                  onChange={(e) => setLojas(lojas.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Loja ${i + 1}`}
                />
                {lojas.length > 1 && (
                  <button type="button" className="btn-secundario" onClick={() => setLojas(lojas.filter((_, j) => j !== i))}>Remover</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 text-sm text-primary hover:underline" onClick={() => setLojas([...lojas, `Loja ${lojas.length + 1}`])}>
            + Adicionar loja
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Você será o Dono desta empresa e poderá cadastrar os usuários dela em "Usuários".</p>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex gap-2">
          <button className="btn-primario" disabled={salvando}>{salvando ? "Criando..." : "Criar empresa"}</button>
          {podeCancelar && <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>}
        </div>
      </form>
    </Card>
  );
}

function EditarEmpresa({ empresa, onFechar, onSalva }: { empresa: EmpresaComPapel; onFechar: () => void; onSalva: () => void }) {
  const { admin } = useTelas();
  const [f, setF] = useState({
    nome: empresa.nome,
    cnpj: empresa.cnpj ?? "",
    pct_extras: String(empresa.pct_extras),
    meta_otimo: String(empresa.meta_otimo),
    meta_alerta: String(empresa.meta_alerta),
  });
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [novaLoja, setNovaLoja] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregarLojas = () =>
    supabase.from("lojas").select("*").eq("empresa_id", empresa.id).order("ordem").then(({ data }) => setLojas((data as Loja[]) ?? []));
  useEffect(() => {
    carregarLojas();
  }, [empresa.id]);

  const num = (s: string) => Number(s.replace(",", "."));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (num(f.meta_otimo) >= num(f.meta_alerta)) return setErro("A meta ÓTIMO precisa ser menor que a de ALERTA.");
    setSalvando(true);
    const { error } = await supabase
      .from("empresas")
      .update({ nome: f.nome.trim(), cnpj: f.cnpj.trim() || null, pct_extras: num(f.pct_extras), meta_otimo: num(f.meta_otimo), meta_alerta: num(f.meta_alerta) })
      .eq("id", empresa.id);
    if (!error) {
      for (const l of lojas) {
        const { error: e2 } = await supabase.from("lojas").update({ nome: l.nome.trim() || l.codigo }).eq("id", l.id);
        if (e2) {
          setErro(e2.message);
          setSalvando(false);
          return;
        }
      }
    }
    setSalvando(false);
    if (error) return setErro(error.message);
    onSalva();
  }

  async function adicionarLoja() {
    setErro(null);
    const { error } = await supabase.rpc("adicionar_loja", { p_empresa: empresa.id, p_nome: novaLoja || null });
    if (error) return setErro(error.message);
    setNovaLoja("");
    carregarLojas();
  }

  return (
    <Card titulo={`Configurar — ${empresa.nome}`} acoes={<button className="text-xs text-muted-foreground hover:text-foreground" onClick={onFechar}>Fechar</button>}>
      <form onSubmit={salvar} className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">Nome<input className="campo mt-1" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required /></label>
          <label className="text-sm">CNPJ<input className="campo mt-1" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} /></label>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm">Gastos Extras (%)<input className="campo mt-1" inputMode="decimal" value={f.pct_extras} onChange={(e) => setF({ ...f, pct_extras: e.target.value })} /></label>
          <label className="text-sm">ÓTIMO abaixo de (%)<input className="campo mt-1" inputMode="decimal" value={f.meta_otimo} onChange={(e) => setF({ ...f, meta_otimo: e.target.value })} /></label>
          <label className="text-sm">ALERTA a partir de (%)<input className="campo mt-1" inputMode="decimal" value={f.meta_alerta} onChange={(e) => setF({ ...f, meta_alerta: e.target.value })} /></label>
        </div>
        <div>
          <div className="text-sm mb-2">Lojas</div>
          <div className="space-y-2">
            {lojas.map((l) => (
              <input key={l.id} className="campo" value={l.nome} onChange={(e) => setLojas(lojas.map((x) => (x.id === l.id ? { ...x, nome: e.target.value } : x)))} />
            ))}
          </div>
          {admin ? (
            <div className="flex gap-2 mt-2">
              <input className="campo" placeholder={`Loja ${lojas.length + 1}`} value={novaLoja} onChange={(e) => setNovaLoja(e.target.value)} />
              <button type="button" className="btn-secundario whitespace-nowrap" onClick={adicionarLoja}>+ Adicionar loja</button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">Só o administrador adiciona lojas.</p>
          )}
          {admin && (
            <p className="text-xs text-muted-foreground mt-1">
              Loja nova vira unidade da rede e entra nas análises, mas não libera ninguém: libere pelo Portal (copiar permissões de outra loja).
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">Lojas não são excluídas para não perder o histórico de lançamentos; renomeie se precisar.</p>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        <button className="btn-primario" disabled={salvando}>{salvando ? "Salvando..." : "Salvar alterações"}</button>
      </form>
    </Card>
  );
}
