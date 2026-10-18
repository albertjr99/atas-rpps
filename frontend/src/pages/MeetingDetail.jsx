import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Microphone,
  FileText,
  Trash,
  Play,
  CalendarBlank,
  MapPin,
  User,
  CheckCircle,
  Clock,
  Hourglass,
  Users,
  ListBullets,
} from "@phosphor-icons/react";

const STATUS_LABELS = {
  scheduled:   { label: "Agendada",     color: "bg-blue-50 text-blue-700 border-blue-200",     dot: "bg-blue-500" },
  in_progress: { label: "Em andamento", color: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
  completed:   { label: "Concluída",    color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  approved:    { label: "Aprovada",     color: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
};

const AGENDA_STATUS = {
  pending:     { label: "Pendente",     color: "bg-slate-100 text-slate-500", icon: Hourglass },
  in_progress: { label: "Em andamento", color: "bg-amber-50 text-amber-700",  icon: Clock },
  completed:   { label: "Concluído",    color: "bg-emerald-50 text-emerald-700", icon: CheckCircle },
};

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-slate-400" />
        <div className="label-eyebrow">{label}</div>
      </div>
      <div className="font-semibold text-slate-900">{value || "—"}</div>
    </div>
  );
}

export default function MeetingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);

  useEffect(() => {
    api.get(`/meetings/${id}`)
      .then(({ data }) => setMeeting(data))
      .catch(() => toast.error("Erro ao carregar reunião"));
  }, [id]);

  const startMeeting = async () => {
    try {
      await api.post(`/meetings/${id}/start`);
      navigate(`/meetings/${id}/conduct`);
    } catch {
      toast.error("Erro ao iniciar reunião");
    }
  };

  const remove = async () => {
    if (!confirm("Excluir esta reunião permanentemente?")) return;
    await api.delete(`/meetings/${id}`);
    toast.success("Reunião excluída");
    navigate("/");
  };

  if (!meeting) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="h-8 w-32 shimmer rounded-lg mb-8" />
        <div className="h-12 w-96 shimmer rounded-xl mb-4" />
        <div className="grid md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-24 shimmer rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const st = STATUS_LABELS[meeting.status];
  const completedTopics = meeting.agenda.filter((t) => t.status === "completed").length;
  const progress = meeting.agenda.length > 0 ? (completedTopics / meeting.agenda.length) * 100 : 0;

  return (
    <div className="p-8 max-w-5xl mx-auto fade-in" data-testid="meeting-detail-page">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Voltar ao painel
      </button>

      {/* ── Header ── */}
      <header className="mb-8 flex items-start justify-between gap-6 fade-up">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <Badge variant="outline" className={`${st?.color} flex items-center gap-1.5`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st?.dot}`} />
              {st?.label}
            </Badge>
            <span className="text-xs font-mono font-bold text-slate-400">
              #{String(meeting.number).padStart(3, "0")}
            </span>
          </div>
          <h1 className="font-display font-black text-4xl tracking-tight text-slate-900 mb-3">
            {meeting.title}
          </h1>
          <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <CalendarBlank size={14} className="text-slate-400" />
              {meeting.date} · {meeting.start_time}
              {meeting.end_time && ` – ${meeting.end_time}`}
            </span>
            <span className="flex items-center gap-1.5">
              <ListBullets size={14} className="text-slate-400" />
              {meeting.meeting_type}
            </span>
            {meeting.location && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} className="text-slate-400" />
                {meeting.location}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {meeting.status === "completed" || meeting.status === "approved" ? (
            <Button
              onClick={() => navigate(`/meetings/${id}/ata`)}
              className="bg-[#0055FF] hover:bg-[#0044CC] rounded-xl shadow-lg shadow-blue-500/20"
              data-testid="view-ata-btn"
            >
              <FileText size={16} /> Ver Ata
            </Button>
          ) : meeting.status === "in_progress" ? (
            <Button
              onClick={() => navigate(`/meetings/${id}/conduct`)}
              className="bg-[#FF3B30] hover:bg-[#E0342A] rounded-xl shadow-lg shadow-red-500/20"
              data-testid="continue-meeting-btn"
            >
              <Microphone size={16} weight="fill" /> Continuar Reunião
            </Button>
          ) : (
            <Button
              onClick={startMeeting}
              className="bg-[#FF3B30] hover:bg-[#E0342A] rounded-xl shadow-lg shadow-red-500/20"
              data-testid="start-meeting-btn"
            >
              <Play size={16} weight="fill" /> Iniciar Reunião
            </Button>
          )}
          <Button
            variant="outline"
            onClick={remove}
            className="rounded-xl border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200"
            data-testid="delete-meeting-btn"
          >
            <Trash size={16} />
          </Button>
        </div>
      </header>

      {/* ── Info cards ── */}
      <div className="grid md:grid-cols-3 gap-4 mb-6 fade-up-delay-1">
        <InfoCard icon={MapPin} label="Local" value={meeting.location} />
        <InfoCard icon={User} label="Presidente / Coordenador" value={meeting.president} />
        <InfoCard icon={User} label="Secretário" value={meeting.secretary} />
      </div>

      {/* ── Agenda progress ── */}
      {meeting.agenda.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 mb-6 fade-up-delay-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ListBullets size={15} className="text-[#0055FF]" />
              <span className="font-semibold text-sm text-slate-700">Progresso da pauta</span>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {completedTopics}/{meeting.agenda.length} tópicos
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #0055FF, #3B82F6)",
              }}
            />
          </div>
        </div>
      )}

      {/* ── Participants ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 mb-6 fade-up-delay-3">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-[#0055FF]" />
          <h2 className="font-display text-lg font-bold">
            Participantes
            <span className="ml-2 text-sm font-normal text-slate-400">
              ({meeting.participants.length})
            </span>
          </h2>
        </div>
        {meeting.participants.length === 0 ? (
          <p className="text-sm text-slate-400">Sem participantes registrados.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {meeting.participants.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3.5 bg-slate-50/80 rounded-xl border border-slate-100"
                data-testid={`participant-${i}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-xs font-bold text-[#0055FF]">
                    {(p.name || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-400">
                      {[p.role, p.institution].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    p.present
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-xs"
                      : "bg-slate-50 text-slate-500 text-xs"
                  }
                >
                  {p.present ? "Presente" : "Ausente"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Agenda items ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 fade-up-delay-4">
        <div className="flex items-center gap-2 mb-4">
          <ListBullets size={16} className="text-[#0055FF]" />
          <h2 className="font-display text-lg font-bold">Ordem do dia</h2>
        </div>
        <div className="space-y-2">
          {meeting.agenda.map((t, i) => {
            const agSt = AGENDA_STATUS[t.status] || AGENDA_STATUS.pending;
            const AgIcon = agSt.icon;
            return (
              <div
                key={t.id}
                className="flex items-start gap-3 p-4 bg-slate-50/80 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors"
                data-testid={`agenda-item-${i}`}
              >
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-bold font-mono text-slate-500 flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-slate-900">{t.title}</div>
                  {t.summary && (
                    <div className="text-xs text-slate-400 mt-1 line-clamp-2">{t.summary}</div>
                  )}
                </div>
                <Badge variant="outline" className={`${agSt.color} flex items-center gap-1.5 flex-shrink-0 text-xs`}>
                  <AgIcon size={11} weight="fill" />
                  {agSt.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
