import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  MagnifyingGlass,
  CalendarBlank,
  CheckCircle,
  Clock,
  ArrowRight,
  Microphone,
  FileText,
  Lightning,
  ArrowUpRight,
  TrendUp,
  TrendDown,
} from "@phosphor-icons/react";

const STATUS_LABELS = {
  scheduled:   { label: "Agendada",     color: "bg-blue-50 text-blue-700 border-blue-200",     dot: "bg-blue-500" },
  in_progress: { label: "Em andamento", color: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
  completed:   { label: "Concluída",    color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  approved:    { label: "Aprovada",     color: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
};

function useCountUp(target, duration = 1000) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target === prev.current) return;
    const start = prev.current;
    const diff = target - start;
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(step);
      else prev.current = target;
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function KpiCard({ label, value, icon: Icon, gradient, iconColor, testid }) {
  const count = useCountUp(value);
  return (
    <div
      className="bg-white rounded-2xl p-5 border border-slate-200/80 card-lift relative overflow-hidden"
      data-testid={testid}
    >
      <div
        className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-8"
        style={{ background: gradient }}
      />
      <div className="flex items-start justify-between mb-4 relative">
        <div className="label-eyebrow">{label}</div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
          style={{ background: gradient }}
        >
          <Icon size={17} weight="bold" className={iconColor} />
        </div>
      </div>
      <div className="font-display font-black text-5xl tracking-tight text-slate-900 relative">
        {count}
      </div>
    </div>
  );
}

function EcoIndicator({ label, value, unit, change_pct }) {
  const positive = change_pct == null || change_pct >= 0;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-white/40 uppercase tracking-widest">{label}</span>
      <span className="font-bold text-white text-sm">
        {unit === "R$" ? `${unit} ` : ""}{typeof value === "number" ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
        {unit !== "R$" ? <span className="text-white/50 font-normal text-xs ml-0.5">{unit}</span> : null}
      </span>
      {change_pct != null && (
        <span className={`text-[10px] flex items-center gap-0.5 ${positive ? "text-emerald-400" : "text-red-400"}`}>
          {positive ? <TrendUp className="w-3 h-3" /> : <TrendDown className="w-3 h-3" />}
          {positive ? "+" : ""}{change_pct.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

function EcoBar() {
  const [eco, setEco] = useState(null);
  useEffect(() => {
    api.get("/economicos").then((r) => setEco(r.data)).catch(() => {});
  }, []);

  if (!eco) return null;

  const indicators = [
    { label: "SELIC", value: eco.selic?.value, unit: eco.selic?.unit },
    { label: "IPCA 12m", value: eco.ipca?.value, unit: eco.ipca?.unit },
    { label: "Dólar", value: eco.dolar?.value, unit: eco.dolar?.unit },
    { label: "CDI", value: eco.cdi?.value, unit: eco.cdi?.unit },
    { label: "Ibovespa", value: eco.ibovespa?.value, unit: "pts", change_pct: eco.ibovespa?.change_pct },
  ];

  return (
    <div
      className="rounded-2xl px-6 py-4 mb-6 flex items-center gap-8 flex-wrap fade-up-delay-1"
      style={{ background: "linear-gradient(135deg, #0B1628, #0F2040)" }}
    >
      <div>
        <p className="text-[9px] uppercase tracking-[0.25em] text-white/30 font-bold">Indicadores Macro</p>
        <p className="text-[10px] text-white/25 mt-0.5">BCB · {new Date().toLocaleDateString("pt-BR")}</p>
      </div>
      <div className="flex-1 flex items-center gap-8 flex-wrap">
        {indicators.map((ind) => (
          <EcoIndicator key={ind.label} {...ind} />
        ))}
      </div>
      {eco.scenario && (
        <div className="hidden xl:block max-w-xs">
          <p className="text-[10px] text-white/30 mb-0.5">Cenário</p>
          <p className="text-[11px] text-white/60 leading-relaxed line-clamp-2" title={eco.scenario.disclaimer || ""}>{eco.scenario.guidance}</p>
        </div>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      {[140, 220, 120, 100, 90, 70, 60].map((w, i) => (
        <td key={i} className="px-4 py-4">
          <div className="shimmer h-4 rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({});
  const [meetings, setMeetings] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/meetings", { params: search ? { search } : {} }),
      ]);
      setStats(s.data);
      setMeetings(m.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const upcoming = meetings.filter((m) => m.status === "scheduled" || m.status === "in_progress");
  const history  = meetings.filter((m) => m.status === "completed"  || m.status === "approved");
  const filtered = (list) =>
    !search
      ? list
      : list.filter((m) =>
          [m.title, m.meeting_type, m.location, String(m.number)]
            .join(" ").toLowerCase().includes(search.toLowerCase())
        );

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="dashboard-page">

      {/* ── Header ── */}
      <header className="flex items-start justify-between mb-8 fade-up">
        <div>
          <p className="text-sm font-medium text-slate-400 mb-1">{getGreeting()} 👋</p>
          <h1 className="font-display font-black text-[2.2rem] tracking-tight text-slate-900 leading-none">
            Painel de Controle
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            Gerencie reuniões, atas e deliberações do RPPS com IA.
          </p>
        </div>
        <Button
          onClick={() => navigate("/meetings/new")}
          className="bg-[#0055FF] hover:bg-[#0044CC] h-11 px-5 rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all"
          data-testid="new-meeting-btn"
        >
          <Plus size={17} weight="bold" /> Nova Reunião
        </Button>
      </header>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="fade-up-delay-1">
          <KpiCard
            label="Total de Reuniões"
            value={stats.total_meetings ?? 0}
            icon={CalendarBlank}
            gradient="linear-gradient(135deg, #0055FF, #3B82F6)"
            iconColor="text-white"
            testid="kpi-total-meetings"
          />
        </div>
        <div className="fade-up-delay-2">
          <KpiCard
            label="Próximas"
            value={stats.upcoming_meetings ?? 0}
            icon={Clock}
            gradient="linear-gradient(135deg, #F59E0B, #FBBF24)"
            iconColor="text-white"
            testid="kpi-upcoming-meetings"
          />
        </div>
        <div className="fade-up-delay-3">
          <KpiCard
            label="Concluídas"
            value={stats.completed_meetings ?? 0}
            icon={CheckCircle}
            gradient="linear-gradient(135deg, #10B981, #34D399)"
            iconColor="text-white"
            testid="kpi-completed-meetings"
          />
        </div>
        <div className="fade-up-delay-4">
          <KpiCard
            label="Deliberações Abertas"
            value={stats.pending_deliberations ?? 0}
            icon={Lightning}
            gradient="linear-gradient(135deg, #FF3B30, #FF6B63)"
            iconColor="text-white"
            testid="kpi-pending-deliberations"
          />
        </div>
      </div>

      {/* ── Economic indicators bar ── */}
      <EcoBar />

      {/* ── Search ── */}
      <div className="mb-6 fade-up-delay-2">
        <div className="relative max-w-md">
          <MagnifyingGlass
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            placeholder="Buscar por título, tipo, local ou número…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 rounded-xl border-slate-200 bg-white shadow-sm focus:shadow-md transition-shadow"
            data-testid="meetings-search-input"
          />
        </div>
      </div>

      {/* ── Upcoming meetings ── */}
      <section className="mb-8 fade-up-delay-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
              Reuniões Agendadas
            </h2>
          </div>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
            {filtered(upcoming).length} reuniões
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
          {loading ? (
            <table className="w-full">
              <tbody>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </tbody>
            </table>
          ) : filtered(upcoming).length === 0 ? (
            <div className="p-16 text-center" data-testid="empty-upcoming">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CalendarBlank size={28} className="text-blue-400" />
              </div>
              <div className="font-semibold text-slate-700 mb-1">Nenhuma reunião agendada</div>
              <div className="text-sm text-slate-400 mb-5">
                Crie sua primeira reunião para começar
              </div>
              <Button
                variant="outline"
                onClick={() => navigate("/meetings/new")}
                className="rounded-xl border-slate-200"
              >
                <Plus size={16} /> Criar reunião
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm" data-testid="upcoming-meetings-table">
              <thead className="border-b border-slate-100">
                <tr className="text-left">
                  <th className="px-5 py-3.5 label-eyebrow">Nº</th>
                  <th className="px-5 py-3.5 label-eyebrow">Título</th>
                  <th className="px-5 py-3.5 label-eyebrow">Data · Hora</th>
                  <th className="px-5 py-3.5 label-eyebrow">Local</th>
                  <th className="px-5 py-3.5 label-eyebrow">Tipo</th>
                  <th className="px-5 py-3.5 label-eyebrow">Status</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {filtered(upcoming).map((m, idx) => {
                  const st = STATUS_LABELS[m.status];
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors group"
                      data-testid={`meeting-row-${m.id}`}
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <td className="px-5 py-4 font-mono text-xs text-slate-400 font-bold">
                        #{String(m.number).padStart(3, "0")}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-800">{m.title}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <CalendarBlank size={13} />
                          {m.date} · {m.start_time}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{m.location || "—"}</td>
                      <td className="px-5 py-4 text-slate-500">{m.meeting_type}</td>
                      <td className="px-5 py-4">
                        <Badge
                          variant="outline"
                          className={`${st?.color} flex items-center gap-1.5 w-fit`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${st?.dot}`} />
                          {st?.label}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {m.status === "in_progress" ? (
                          <Button
                            size="sm"
                            onClick={() => navigate(`/meetings/${m.id}/conduct`)}
                            className="bg-[#FF3B30] hover:bg-[#E0342A] rounded-lg shadow-sm"
                            data-testid={`continue-${m.id}`}
                          >
                            <Microphone size={14} weight="fill" /> Continuar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/meetings/${m.id}`)}
                            className="rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`open-${m.id}`}
                          >
                            Abrir <ArrowRight size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── History ── */}
      <section className="fade-up-delay-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
            Histórico de Atas
          </h2>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
            {filtered(history).length} atas
          </span>
        </div>

        {filtered(history).length === 0 ? (
          <div
            className="p-16 text-center text-slate-400 border border-slate-200/80 rounded-2xl bg-white"
            data-testid="empty-history"
          >
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText size={28} className="text-slate-300" />
            </div>
            <div className="font-semibold text-slate-500 mb-1">Nenhuma ata concluída</div>
            <div className="text-sm">Atas geradas pela IA aparecerão aqui</div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered(history).map((m, idx) => {
              const st = STATUS_LABELS[m.status];
              return (
                <div
                  key={m.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 card-lift group"
                  data-testid={`history-card-${m.id}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                        ATA #{String(m.number).padStart(3, "0")}
                      </div>
                      <h3 className="font-bold text-slate-900 leading-snug">{m.title}</h3>
                    </div>
                    <Badge variant="outline" className={`${st?.color} ml-2 flex-shrink-0 flex items-center gap-1.5`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st?.dot}`} />
                      {st?.label}
                    </Badge>
                  </div>
                  <div className="text-sm text-slate-500 space-y-0.5 mb-4">
                    <div className="flex items-center gap-1.5">
                      <CalendarBlank size={12} />
                      {m.date} · {m.meeting_type}
                    </div>
                    {m.location && <div className="pl-[20px] text-slate-400">{m.location}</div>}
                  </div>
                  <Link
                    to={`/meetings/${m.id}/ata`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0055FF] hover:gap-2.5 transition-all"
                    data-testid={`view-ata-${m.id}`}
                  >
                    Ver ata <ArrowRight size={14} />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
