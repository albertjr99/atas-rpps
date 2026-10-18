import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  GearSix,
  Users,
  Plus,
  Trash,
  FloppyDisk,
  CheckCircle,
  ShieldStar,
  Buildings,
  PencilSimple,
  X,
  Warning,
} from "@phosphor-icons/react";

const ATA_STYLES = [
  { value: "rpps_padrao", label: "RPPS Padrão (recomendado)" },
  { value: "conselho_deliberativo", label: "Conselho Deliberativo" },
  { value: "diretoria_executiva", label: "Diretoria Executiva" },
  { value: "comite_investimentos", label: "Comitê de Investimentos" },
  { value: "personalizado", label: "Personalizado" },
];

function SettingsTab({ settings, onSave, saving, saved }) {
  const [form, setForm] = useState({
    institution_name: "",
    ata_style: "rpps_padrao",
    custom_opening: "",
    custom_closing: "",
    default_president: "",
    default_secretary: "",
    formal_markers: [],
    ...settings,
  });

  useEffect(() => {
    if (settings) setForm((prev) => ({ ...prev, ...settings }));
  }, [settings]);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const [markerInput, setMarkerInput] = useState("");

  const addMarker = () => {
    const m = markerInput.trim();
    if (m && !form.formal_markers.includes(m)) {
      set("formal_markers", [...(form.formal_markers || []), m]);
    }
    setMarkerInput("");
  };

  const removeMarker = (m) => {
    set("formal_markers", (form.formal_markers || []).filter((x) => x !== m));
  };

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Buildings className="w-5 h-5 text-[#0055FF]" weight="fill" />
          <h2 className="font-semibold text-slate-800">Dados Institucionais</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Nome da Instituição</label>
            <input className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]/30 focus:border-[#0055FF]" value={form.institution_name || ""} onChange={(e) => set("institution_name", e.target.value)} placeholder="Ex.: RPPS do Município de São Paulo" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Estilo de Ata</label>
            <select className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]/30 focus:border-[#0055FF] bg-white" value={form.ata_style || "rpps_padrao"} onChange={(e) => set("ata_style", e.target.value)}>
              {ATA_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Presidente padrão</label>
            <input className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]/30 focus:border-[#0055FF]" value={form.default_president || ""} onChange={(e) => set("default_president", e.target.value)} placeholder="Nome do presidente / coordenador" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Secretário padrão</label>
            <input className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]/30 focus:border-[#0055FF]" value={form.default_secretary || ""} onChange={(e) => set("default_secretary", e.target.value)} placeholder="Nome do secretário" />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <PencilSimple className="w-5 h-5 text-[#0055FF]" weight="fill" />
          <h2 className="font-semibold text-slate-800">Textos Padrão</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Abertura da Ata</label>
            <textarea rows={3} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]/30 focus:border-[#0055FF] resize-none" value={form.custom_opening || ""} onChange={(e) => set("custom_opening", e.target.value)} placeholder="Ex.: Aos [dia] dias do mês de [mês] do ano de [ano]…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Encerramento da Ata</label>
            <textarea rows={3} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]/30 focus:border-[#0055FF] resize-none" value={form.custom_closing || ""} onChange={(e) => set("custom_closing", e.target.value)} placeholder="Ex.: Nada mais havendo a tratar, o Presidente declarou encerrada a reunião…" />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-2">
          <ShieldStar className="w-5 h-5 text-[#0055FF]" weight="fill" />
          <h2 className="font-semibold text-slate-800">Marcadores Formais Institucionais</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">Termos que o agente IA deve usar e identificar nas atas da sua instituição.</p>
        <div className="flex gap-2 mb-3">
          <input className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]/30 focus:border-[#0055FF]" value={markerInput} onChange={(e) => setMarkerInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMarker()} placeholder="Ex.: consoante deliberação anterior" />
          <button onClick={addMarker} className="px-4 py-2 bg-[#0055FF] text-white text-sm rounded-xl hover:bg-[#0044CC] transition-colors flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(form.formal_markers || []).map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5 bg-[#0055FF]/10 text-[#0055FF] text-xs px-3 py-1.5 rounded-full">
              {m}
              <button onClick={() => removeMarker(m)} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
            </span>
          ))}
          {(form.formal_markers || []).length === 0 && <span className="text-xs text-slate-400 italic">Nenhum marcador personalizado</span>}
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={() => onSave(form)} disabled={saving} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-medium transition-all ${saved ? "bg-emerald-500" : "bg-[#0055FF] hover:bg-[#0044CC]"} disabled:opacity-50`}>
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" weight="fill" /> : <FloppyDisk className="w-4 h-4" />}
          {saved ? "Salvo!" : saving ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>
    </div>
  );
}

function AddUserModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "editor" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.email || !form.password) { setError("Preencha todos os campos obrigatórios."); return; }
    setLoading(true);
    try { await onAdd(form); onClose(); }
    catch (e) { setError(e.response?.data?.detail || "Erro ao criar usuário."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-800">Novo Usuário</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3">
          {[
            { key: "name", label: "Nome completo *", type: "text", placeholder: "Maria da Silva" },
            { key: "email", label: "E-mail *", type: "email", placeholder: "maria@rpps.gov.br" },
            { key: "password", label: "Senha *", type: "password", placeholder: "mínimo 8 caracteres" },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
              <input type={type} value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]/30 focus:border-[#0055FF]" />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Perfil</label>
            <select value={form.role} onChange={(e) => set("role", e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]/30 focus:border-[#0055FF] bg-white">
              <option value="editor">Secretário(a) / Editor</option>
              <option value="viewer">Somente leitura</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
        </div>
        {error && <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2"><Warning className="w-4 h-4 flex-shrink-0" /> {error}</div>}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
          <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 rounded-xl bg-[#0055FF] text-white text-sm font-medium hover:bg-[#0044CC] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Criar usuário
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => { const r = await api.get("/admin/users"); return r.data; },
  });

  const addUser = async (form) => {
    await api.post("/admin/users", form);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const deleteUser = async (id) => {
    await api.delete(`/admin/users/${id}`);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    setDeleteConfirm(null);
  };

  const ROLE_LABEL = { superadmin: "Plataforma", admin: "Administrador", editor: "Editor", viewer: "Leitura" };
  const ROLE_COLOR = { superadmin: "bg-amber-100 text-amber-700", admin: "bg-[#0055FF]/10 text-[#0055FF]", editor: "bg-emerald-50 text-emerald-700", viewer: "bg-slate-100 text-slate-500" };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-500"><span className="font-semibold text-slate-800">{users.length}</span> usuário{users.length !== 1 ? "s" : ""} cadastrado{users.length !== 1 ? "s" : ""}</p>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-[#0055FF] text-white text-sm font-medium rounded-xl hover:bg-[#0044CC] transition-colors">
          <Plus className="w-4 h-4" /> Novo usuário
        </button>
      </div>
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-white border border-slate-100 shimmer" />)}</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="bg-white rounded-xl border border-slate-100 px-5 py-3 flex items-center gap-4">
              <div className="w-9 h-9 rounded-lg bg-[#0055FF]/10 flex items-center justify-center text-[#0055FF] font-bold text-sm flex-shrink-0">{u.name?.[0]?.toUpperCase() || "?"}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 text-sm truncate">{u.name}</p>
                <p className="text-xs text-slate-400 truncate">{u.email}</p>
              </div>
              {u.institution && <p className="text-xs text-slate-400 hidden md:block truncate max-w-[200px]">{u.institution}</p>}
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLOR[u.role] || ROLE_COLOR.viewer}`}>{ROLE_LABEL[u.role] || u.role}</span>
              {deleteConfirm === u.id ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => deleteUser(u.id)} className="text-xs px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">Confirmar</button>
                  <button onClick={() => setDeleteConfirm(null)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">Cancelar</button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirm(u.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash className="w-4 h-4" /></button>
              )}
            </div>
          ))}
        </div>
      )}
      {showModal && <AddUserModal onClose={() => setShowModal(false)} onAdd={addUser} />}
    </div>
  );
}

export default function AdminSettings() {
  const [tab, setTab] = useState("settings");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => { const r = await api.get("/admin/settings"); return r.data; },
  });

  const saveSettings = async (form) => {
    setSaving(true);
    try {
      await api.put("/admin/settings", form);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const TABS = [
    { key: "settings", label: "Configurações", icon: GearSix },
    { key: "users", label: "Usuários", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 fade-up">
      <div className="mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0055FF]/10 flex items-center justify-center">
          <GearSix className="w-5 h-5 text-[#0055FF]" weight="fill" />
        </div>
        <div>
          <p className="label-eyebrow">ATAS RPPS</p>
          <h1 className="text-2xl font-bold text-slate-800">Administração</h1>
        </div>
      </div>

      <div className="flex gap-1 bg-white rounded-xl border border-slate-100 p-1 w-fit mb-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === key ? "bg-[#0055FF] text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}>
            <Icon className="w-4 h-4" weight={tab === key ? "fill" : "regular"} />
            {label}
          </button>
        ))}
      </div>

      {tab === "settings" ? <SettingsTab settings={settings} onSave={saveSettings} saving={saving} saved={saved} /> : <UsersTab />}
    </div>
  );
}
