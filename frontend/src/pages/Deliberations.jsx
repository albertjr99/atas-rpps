import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ListChecks, User, CalendarBlank, Hash } from "@phosphor-icons/react";

const STATUS_OPTIONS = [
  { value: "aberto",       label: "Aberto",       color: "bg-amber-50 text-amber-700 border-amber-200",     dot: "bg-amber-500" },
  { value: "em_andamento", label: "Em andamento", color: "bg-blue-50 text-blue-700 border-blue-200",        dot: "bg-blue-500" },
  { value: "concluido",    label: "Concluído",    color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  { value: "cancelado",    label: "Cancelado",    color: "bg-slate-100 text-slate-500 border-slate-200",    dot: "bg-slate-400" },
];

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-50">
      {[80, 160, 260, 120, 90, 110].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div className="shimmer h-4 rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

export default function Deliberations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/deliberations");
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/deliberations/${id}`, { status });
      toast.success("Status atualizado");
      setItems((arr) => arr.map((d) => (d.id === id ? { ...d, status } : d)));
    } catch {
      toast.error("Erro ao atualizar");
    }
  };

  const visible = filter === "all" ? items : items.filter((d) => d.status === filter);

  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s.value] = items.filter((d) => d.status === s.value).length;
    return acc;
  }, {});

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="deliberations-page">

      {/* ── Header ── */}
      <div className="mb-8 fade-up">
        <div className="label-eyebrow mb-2 text-slate-400">Acompanhamento</div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display font-black text-4xl tracking-tight text-slate-900">
              Deliberações
            </h1>
            <p className="text-slate-500 text-sm mt-2">
              Decisões extraídas automaticamente das reuniões
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{items.length} registros</span>
          </div>
        </div>
      </div>

      {/* ── Status summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 fade-up-delay-1">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(filter === s.value ? "all" : s.value)}
            className={`bg-white rounded-2xl border p-4 text-left transition-all card-lift ${
              filter === s.value
                ? "border-[#0055FF] ring-1 ring-[#0055FF]/20"
                : "border-slate-200/80 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="text-xs font-semibold text-slate-500">{s.label}</span>
            </div>
            <div className="font-display font-black text-3xl text-slate-900">{counts[s.value] ?? 0}</div>
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm fade-up-delay-2">
        {loading ? (
          <table className="w-full">
            <tbody><SkeletonRow /><SkeletonRow /><SkeletonRow /></tbody>
          </table>
        ) : visible.length === 0 ? (
          <div className="p-16 text-center" data-testid="empty-deliberations">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ListChecks size={28} className="text-slate-300" />
            </div>
            <div className="font-semibold text-slate-500 mb-1">
              {filter === "all" ? "Nenhuma deliberação ainda" : "Nenhuma neste status"}
            </div>
            <div className="text-sm text-slate-400 max-w-xs mx-auto">
              {filter === "all"
                ? "Realize uma reunião e a IA registrará automaticamente as decisões tomadas."
                : "Altere o filtro para ver outras deliberações."}
            </div>
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="deliberations-table">
            <thead className="border-b border-slate-100">
              <tr className="text-left">
                <th className="px-5 py-3.5 label-eyebrow">Ata #</th>
                <th className="px-5 py-3.5 label-eyebrow">Tópico</th>
                <th className="px-5 py-3.5 label-eyebrow">Decisão</th>
                <th className="px-5 py-3.5 label-eyebrow">Responsável</th>
                <th className="px-5 py-3.5 label-eyebrow">Prazo</th>
                <th className="px-5 py-3.5 label-eyebrow">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => {
                const opt = STATUS_OPTIONS.find((s) => s.value === d.status);
                return (
                  <tr
                    key={d.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    data-testid={`deliberation-${d.id}`}
                  >
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-slate-400">
                        <Hash size={11} />
                        {String(d.meeting_number).padStart(3, "0")}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-800 max-w-[180px]">
                      <div className="truncate">{d.topic_title}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600 max-w-xs">
                      <div className="line-clamp-2">{d.decision}</div>
                    </td>
                    <td className="px-5 py-4">
                      {d.responsible ? (
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <User size={13} className="text-slate-400" />
                          {d.responsible}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {d.deadline ? (
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <CalendarBlank size={13} className="text-slate-400" />
                          {d.deadline}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Select value={d.status} onValueChange={(v) => updateStatus(d.id, v)}>
                        <SelectTrigger
                          className={`h-8 w-40 border text-xs font-semibold rounded-lg ${opt?.color}`}
                          data-testid={`status-select-${d.id}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${opt?.dot}`} />
                            <SelectValue />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value} className="text-sm">
                              <span className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                {s.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
