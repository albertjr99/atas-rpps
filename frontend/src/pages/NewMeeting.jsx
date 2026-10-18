import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  X,
  UserPlus,
  ListBullets,
  Info,
  ArrowRight,
  CalendarBlank,
  MapPin,
  User,
} from "@phosphor-icons/react";

const MEETING_TYPES = [
  "Reunião Administrativa",
  "Conselho",
  "Diretoria",
  "Comitê",
  "Comissão",
  "Assembleia",
  "Grupo de Trabalho",
  "Reunião Técnica",
  "Outros",
];

const STEPS = [
  { id: 1, label: "Informações", icon: Info },
  { id: 2, label: "Participantes", icon: UserPlus },
  { id: 3, label: "Ordem do dia", icon: ListBullets },
];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8 fade-up">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const done = current > step.id;
        const active = current === step.id;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                    ? "bg-[#0055FF] text-white shadow-lg shadow-blue-500/30"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="tick-animate" />
                  </svg>
                ) : (
                  step.id
                )}
              </div>
              <span
                className={`text-sm font-semibold hidden sm:block ${
                  active ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className="mx-3 h-px w-12 sm:w-20 bg-slate-200 flex-shrink-0">
                <div
                  className="h-full bg-[#0055FF] transition-all duration-500"
                  style={{ width: current > step.id ? "100%" : "0%" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionCard({ icon: Icon, title, action, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm fade-up">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Icon size={16} weight="bold" className="text-[#0055FF]" />
          </div>
          <h2 className="font-display text-base font-bold text-slate-900">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function NewMeeting() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title: "",
    meeting_type: "Reunião Administrativa",
    date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "10:30",
    location: "",
    responsible: "",
    secretary: "",
    president: "",
  });
  const [participants, setParticipants] = useState([
    { name: "", role: "", email: "", institution: "", present: true },
  ]);
  const [agenda, setAgenda] = useState([{ title: "Aprovação da ata anterior" }]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/templates").then((r) => setTemplates(r.data));
  }, []);

  const applyTemplate = (tplId) => {
    setSelectedTemplate(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) setAgenda(tpl.agenda.map((a) => ({ title: a.title })));
  };

  const change = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const handleParticipant = (i, key, val) =>
    setParticipants((arr) => arr.map((p, idx) => (idx === i ? { ...p, [key]: val } : p)));

  const handleAgenda = (i, val) =>
    setAgenda((arr) => arr.map((a, idx) => (idx === i ? { ...a, title: val } : a)));

  const nextStep = () => {
    if (step === 1 && !form.title.trim()) {
      toast.error("Informe o título da reunião");
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const submit = async () => {
    if (agenda.filter((a) => a.title.trim()).length === 0) {
      toast.error("Adicione ao menos um item na pauta");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        participants: participants.filter((p) => p.name.trim()),
        agenda: agenda
          .filter((a) => a.title.trim())
          .map((a, i) => ({ title: a.title, description: "", order: i, status: "pending" })),
      };
      const { data } = await api.post("/meetings", payload);
      toast.success("Reunião criada com sucesso!");
      navigate(`/meetings/${data.id}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao criar reunião");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto" data-testid="new-meeting-page">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        data-testid="back-btn"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      <div className="mb-8 fade-up">
        <div className="label-eyebrow mb-2 text-slate-400">Nova Reunião</div>
        <h1 className="font-display font-black text-4xl tracking-tight text-slate-900">
          Configurar reunião
        </h1>
        <p className="text-slate-500 text-sm mt-2">
          Preencha as informações para criar e agendar sua reunião
        </p>
      </div>

      <StepIndicator current={step} />

      {/* ── Step 1: Informações ── */}
      {step === 1 && (
        <SectionCard icon={Info} title="Informações gerais da reunião">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <Label className="text-xs font-semibold text-slate-600">
                Título da reunião *
              </Label>
              <Input
                value={form.title}
                onChange={change("title")}
                placeholder="Ex.: 2ª Reunião Ordinária do Conselho Deliberativo"
                className="mt-1.5 h-11 rounded-xl border-slate-200"
                data-testid="meeting-title-input"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600">Tipo de Reunião</Label>
              <Select
                value={form.meeting_type}
                onValueChange={(v) => setForm((s) => ({ ...s, meeting_type: v }))}
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="meeting-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEETING_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <MapPin size={12} /> Local
              </Label>
              <Input
                value={form.location}
                onChange={change("location")}
                placeholder="Sala de reuniões, endereço ou videoconferência"
                className="mt-1.5 h-11 rounded-xl border-slate-200"
                data-testid="meeting-location-input"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <CalendarBlank size={12} /> Data
              </Label>
              <Input
                type="date"
                value={form.date}
                onChange={change("date")}
                className="mt-1.5 h-11 rounded-xl border-slate-200"
                data-testid="meeting-date-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600">Início</Label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={change("start_time")}
                  className="mt-1.5 h-11 rounded-xl border-slate-200"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Término</Label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={change("end_time")}
                  className="mt-1.5 h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <User size={12} /> Presidente / Coordenador
              </Label>
              <Input
                value={form.president}
                onChange={change("president")}
                className="mt-1.5 h-11 rounded-xl border-slate-200"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <User size={12} /> Secretário
              </Label>
              <Input
                value={form.secretary}
                onChange={change("secretary")}
                className="mt-1.5 h-11 rounded-xl border-slate-200"
              />
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Step 2: Participantes ── */}
      {step === 2 && (
        <SectionCard
          icon={UserPlus}
          title="Participantes"
          action={
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg border-slate-200"
              onClick={() =>
                setParticipants((p) => [
                  ...p,
                  { name: "", role: "", email: "", institution: "", present: true },
                ])
              }
              data-testid="add-participant-btn"
            >
              <Plus size={14} /> Adicionar
            </Button>
          }
        >
          <div className="space-y-3">
            {participants.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-sm">
                Nenhum participante. Adicione os presentes à reunião.
              </div>
            )}
            {participants.map((p, i) => (
              <div
                key={i}
                className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center p-3 bg-slate-50/80 rounded-xl border border-slate-100"
                data-testid={`participant-row-${i}`}
              >
                <Input
                  placeholder="Nome completo"
                  value={p.name}
                  onChange={(e) => handleParticipant(i, "name", e.target.value)}
                  className="h-10 rounded-lg border-slate-200 bg-white"
                  data-testid={`participant-name-${i}`}
                />
                <Input
                  placeholder="Cargo"
                  value={p.role}
                  onChange={(e) => handleParticipant(i, "role", e.target.value)}
                  className="h-10 rounded-lg border-slate-200 bg-white"
                />
                <Input
                  placeholder="E-mail"
                  value={p.email}
                  onChange={(e) => handleParticipant(i, "email", e.target.value)}
                  className="h-10 rounded-lg border-slate-200 bg-white"
                />
                <Input
                  placeholder="Instituição"
                  value={p.institution}
                  onChange={(e) => handleParticipant(i, "institution", e.target.value)}
                  className="h-10 rounded-lg border-slate-200 bg-white"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setParticipants((arr) => arr.filter((_, idx) => idx !== i))}
                  className="text-slate-400 hover:text-red-500 rounded-lg"
                  data-testid={`remove-participant-${i}`}
                >
                  <X size={16} />
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Step 3: Ordem do dia ── */}
      {step === 3 && (
        <SectionCard
          icon={ListBullets}
          title="Ordem do dia"
          action={
            <div className="flex items-center gap-2">
              {templates.length > 0 && (
                <Select value={selectedTemplate} onValueChange={applyTemplate}>
                  <SelectTrigger className="h-9 w-52 text-sm rounded-lg border-slate-200" data-testid="template-select">
                    <SelectValue placeholder="Usar modelo…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg border-slate-200"
                onClick={() => setAgenda((a) => [...a, { title: "" }])}
                data-testid="add-agenda-btn"
              >
                <Plus size={14} /> Tópico
              </Button>
            </div>
          }
        >
          <div className="space-y-2">
            {agenda.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-slate-50/80 border border-slate-100 rounded-xl px-4 py-3 group hover:border-blue-200 hover:bg-blue-50/20 transition-colors"
                data-testid={`agenda-row-${i}`}
              >
                <div className="w-6 h-6 rounded-lg bg-[#0055FF]/10 border border-[#0055FF]/20 flex items-center justify-center text-xs font-bold font-mono text-[#0055FF] flex-shrink-0">
                  {i + 1}
                </div>
                <Input
                  value={a.title}
                  onChange={(e) => handleAgenda(i, e.target.value)}
                  placeholder={`Tópico ${i + 1}`}
                  className="h-9 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0 font-medium"
                  data-testid={`agenda-input-${i}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setAgenda((arr) => arr.filter((_, idx) => idx !== i))}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 rounded-lg transition-all"
                  data-testid={`remove-agenda-${i}`}
                >
                  <X size={15} />
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Navigation ── */}
      <div className="flex justify-between gap-3 mt-6 fade-up">
        <Button
          variant="outline"
          onClick={step === 1 ? () => navigate("/") : prevStep}
          className="rounded-xl border-slate-200"
          data-testid="cancel-btn"
        >
          <ArrowLeft size={16} />
          {step === 1 ? "Cancelar" : "Voltar"}
        </Button>

        {step < 3 ? (
          <Button
            onClick={nextStep}
            className="bg-[#0055FF] hover:bg-[#0044CC] rounded-xl shadow-lg shadow-blue-500/20 px-6"
          >
            Próximo <ArrowRight size={16} />
          </Button>
        ) : (
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-[#0055FF] hover:bg-[#0044CC] rounded-xl shadow-lg shadow-blue-500/20 px-6"
            data-testid="submit-meeting-btn"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Criando…
              </span>
            ) : (
              <>Criar Reunião <ArrowRight size={16} /></>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
