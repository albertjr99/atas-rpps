import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  FilePdf,
  FileDoc,
  FloppyDisk,
  Sparkle,
  TextB as TextBolder,
  TextItalic,
  TextUnderline,
  ListBullets,
  ListNumbers,
  CalendarBlank,
  CheckCircle,
  Robot,
  Warning,
  ThumbsUp,
  ThumbsDown,
  ArrowsClockwise,
  Gauge,
} from "@phosphor-icons/react";

// ── Quality Score helpers ─────────────────────────────────────────────────────

function ScoreRing({ value, label, color }) {
  const size = 80;
  const stroke = 6;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;

  const ringColor =
    value >= 80 ? "#22c55e" : value >= 60 ? "#f59e0b" : value >= 40 ? "#f97316" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center font-bold text-slate-800"
          style={{ fontSize: 18 }}
        >
          {value}
        </div>
      </div>
      <span className="text-xs text-slate-500 text-center leading-tight">{label}</span>
    </div>
  );
}

function GradeChip({ grade, color }) {
  const COLORS = {
    green: "bg-emerald-100 text-emerald-700",
    yellow: "bg-amber-100 text-amber-700",
    orange: "bg-orange-100 text-orange-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-2xl font-black px-4 py-1.5 rounded-xl ${COLORS[color] || COLORS.yellow}`}>
      {grade}
    </span>
  );
}

function QualityPanel({ meetingId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/meetings/${meetingId}/quality`);
      setData(d);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-10 flex flex-col gap-4">
        <div className="h-6 w-48 shimmer rounded-lg" />
        <div className="flex gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-20 h-24 shimmer rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return (
    <div className="p-10 text-sm text-slate-400">Não foi possível calcular a pontuação.</div>
  );

  const { scores, gaps } = data;

  return (
    <div className="p-8 space-y-8 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
      {/* Overall */}
      <div className="flex items-center justify-between">
        <div>
          <div className="label-eyebrow mb-1">Pontuação de qualidade</div>
          <h3 className="text-2xl font-bold text-slate-800">
            {scores.overall}/100
          </h3>
          <p className="text-sm text-slate-400 mt-0.5">Média das 4 dimensões</p>
        </div>
        <GradeChip grade={scores.grade} color={scores.color} />
      </div>

      {/* Score rings */}
      <div className="flex items-center gap-8 flex-wrap">
        <ScoreRing value={scores.clarity} label="Clareza" />
        <ScoreRing value={scores.formality} label="Formalidade" />
        <ScoreRing value={scores.completeness} label="Completude" />
        <ScoreRing value={scores.structure} label="Estrutura" />
      </div>

      <button
        onClick={load}
        className="flex items-center gap-1.5 text-xs text-[#0055FF] hover:text-[#0044CC] transition-colors"
      >
        <ArrowsClockwise className="w-3.5 h-3.5" /> Recalcular
      </button>

      {/* Gaps */}
      {gaps.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Pendências detectadas ({gaps.length})
          </p>
          <ul className="space-y-2">
            {gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <Warning className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" weight="fill" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {gaps.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-xl px-4 py-3">
          <CheckCircle className="w-4 h-4" weight="fill" />
          Nenhuma pendência detectada. A ata está completa!
        </div>
      )}
    </div>
  );
}

// ── Agent Panel ───────────────────────────────────────────────────────────────

function ChangeCard({ change, onFeedback }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const handle = async (accepted) => {
    setLoading(true);
    await onFeedback(change.id, accepted);
    setLoading(false);
  };

  const STATUS_COLOR = {
    pending: "bg-amber-50 border-amber-200",
    accepted: "bg-emerald-50 border-emerald-200",
    rejected: "bg-slate-50 border-slate-200",
  };
  const STATUS_LABEL = {
    pending: "Pendente",
    accepted: "Aceito",
    rejected: "Rejeitado",
  };

  return (
    <div className={`rounded-xl border p-4 transition-all ${STATUS_COLOR[change.status] || STATUS_COLOR.pending}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-widest truncate">
            {change.section}
          </p>
          <p className="text-sm text-slate-700 line-clamp-2">{change.proposed}</p>
          {change.rationale && (
            <p className="text-xs text-slate-400 mt-1 italic">{change.rationale}</p>
          )}
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full flex-shrink-0 font-medium ${
            change.status === "accepted"
              ? "bg-emerald-100 text-emerald-700"
              : change.status === "rejected"
              ? "bg-slate-200 text-slate-500"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {STATUS_LABEL[change.status] || change.status}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="bg-white/70 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1 font-medium">Original</p>
            <p className="text-xs text-slate-600 line-clamp-4">{change.original}</p>
          </div>
          <div className="bg-white/70 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1 font-medium">Proposta</p>
            <p className="text-xs text-slate-600 line-clamp-4">{change.proposed}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded ? "Ocultar comparação" : "Ver comparação"}
        </button>

        {change.status === "pending" && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => handle(false)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
            >
              <ThumbsDown className="w-3.5 h-3.5" /> Rejeitar
            </button>
            <button
              onClick={() => handle(true)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs hover:bg-emerald-600 transition-all disabled:opacity-50"
            >
              <ThumbsUp className="w-3.5 h-3.5" /> Aceitar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentPanel({ meetingId, onMeetingUpdate }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [changes, setChanges] = useState([]);

  const loadChanges = useCallback(async () => {
    try {
      const { data } = await api.get(`/meetings/${meetingId}/agent/changes`);
      setChanges(data);
    } catch {
      // ignore
    }
  }, [meetingId]);

  useEffect(() => { loadChanges(); }, [loadChanges]);

  const runAgent = async () => {
    setRunning(true);
    try {
      const { data } = await api.post(`/meetings/${meetingId}/agent/run`);
      setResult(data);
      await loadChanges();
      toast.success(`Agente executado — ${data.changes_count} alteração(ões) proposta(s)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao executar agente");
    } finally {
      setRunning(false);
    }
  };

  const handleFeedback = async (changeId, accepted) => {
    try {
      await api.post(`/meetings/${meetingId}/agent/feedback`, {
        change_id: changeId,
        accepted,
        note: "",
      });
      await loadChanges();
      if (accepted) onMeetingUpdate();
      toast.success(accepted ? "Alteração aceita e aplicada" : "Alteração rejeitada");
    } catch {
      toast.error("Erro ao processar feedback");
    }
  };

  const pending = changes.filter((c) => c.status === "pending");

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Agent header */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0055FF]/10 flex items-center justify-center">
            <Robot className="w-5 h-5 text-[#0055FF]" weight="fill" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm">Agente revisor de atas</p>
            <p className="text-xs text-slate-400">
              Analisa e reescreve seções conforme o padrão institucional
            </p>
          </div>
        </div>
        <button
          onClick={runAgent}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0055FF] text-white text-sm font-medium rounded-xl hover:bg-[#0044CC] transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
        >
          {running ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analisando…
            </>
          ) : (
            <>
              <Sparkle className="w-4 h-4" weight="fill" />
              Executar Agente
            </>
          )}
        </button>
      </div>

      {/* Result summary */}
      {result && (
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-6 text-sm flex-wrap">
          <span className="text-slate-600">
            <span className="font-semibold text-slate-800">{result.changes_count}</span> alteração(ões) proposta(s)
          </span>
          {result.score_delta != null && (
            <span className={`font-semibold ${result.score_delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {result.score_delta >= 0 ? "+" : ""}{result.score_delta} pontos de qualidade
            </span>
          )}
          {result.gaps?.length > 0 && (
            <span className="text-amber-600">
              <Warning className="w-3.5 h-3.5 inline mr-1" weight="fill" />
              {result.gaps.length} pendência(s)
            </span>
          )}
        </div>
      )}

      {/* Changes list */}
      <div className="p-6">
        {changes.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            <Robot className="w-10 h-10 mx-auto mb-3 text-slate-200" weight="fill" />
            Execute o agente para analisar e melhorar a ata automaticamente.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Alterações propostas
              </p>
              {pending.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full font-medium">
                  {pending.length} pendente{pending.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="space-y-3">
              {changes.map((c) => (
                <ChangeCard key={c.id} change={c} onFeedback={handleFeedback} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ── Main component ────────────────────────────────────────────────────────────

export default function AtaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const editorRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await api.get(`/meetings/${id}`);
    setMeeting(data);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (meeting && editorRef.current && !editorRef.current.dataset.initialized) {
      editorRef.current.innerHTML = meeting.ata_content || "<p>Ata ainda não gerada.</p>";
      editorRef.current.dataset.initialized = "true";
    }
  }, [meeting]);

  // Refresh editor content when meeting updates (after agent accept)
  const refreshEditor = useCallback(async () => {
    const { data } = await api.get(`/meetings/${id}`);
    setMeeting(data);
    if (editorRef.current) {
      editorRef.current.innerHTML = data.ata_content || "<p>Ata ainda não gerada.</p>";
    }
  }, [id]);

  const save = async () => {
    if (!editorRef.current) return;
    setSaving(true);
    try {
      await api.patch(`/meetings/${id}`, { ata_content: editorRef.current.innerHTML });
      toast.success("Ata salva com sucesso");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/meetings/${id}/generate-ata`);
      if (editorRef.current) {
        editorRef.current.innerHTML = data.ata_completa;
      }
      toast.success("Ata regenerada pela IA");
      await load();
    } catch {
      toast.error("Erro ao regenerar");
    } finally {
      setSaving(false);
    }
  };

  const exportFile = (format) => {
    const token = localStorage.getItem("ata_token");
    fetch(`${API}/meetings/${id}/export/${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ata_${meeting.number}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const exec = (cmd, val) => document.execCommand(cmd, false, val ?? null);

  if (!meeting) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <div className="h-8 w-32 shimmer rounded-lg mb-6" />
        <div className="h-12 w-96 shimmer rounded-xl mb-4" />
        <div className="h-96 shimmer rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" data-testid="ata-editor-page">
      <button
        onClick={() => navigate(`/meetings/${id}`)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Voltar à reunião
      </button>

      {/* ── Header ── */}
      <header className="mb-6 flex items-start justify-between gap-4 fade-up">
        <div>
          <div className="label-eyebrow mb-2 text-slate-400">
            ATA #{String(meeting.number).padStart(3, "0")}
          </div>
          <h1 className="font-display font-black text-4xl tracking-tight text-slate-900">
            {meeting.title}
          </h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <CalendarBlank size={13} className="text-slate-400" />
              {meeting.date}
            </span>
            <span className="text-slate-300">·</span>
            <span>{meeting.meeting_type}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          <Button
            variant="outline"
            onClick={regenerate}
            disabled={saving}
            className="rounded-xl border-slate-200 gap-1.5"
            data-testid="regenerate-ata-btn"
          >
            <Sparkle size={15} className="text-[#0055FF]" />
            Regenerar IA
          </Button>
          <Button
            variant="outline"
            onClick={() => exportFile("pdf")}
            className="rounded-xl border-slate-200 gap-1.5"
            data-testid="export-pdf-btn"
          >
            <FilePdf size={15} className="text-red-500" /> PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => exportFile("docx")}
            className="rounded-xl border-slate-200 gap-1.5"
            data-testid="export-docx-btn"
          >
            <FileDoc size={15} className="text-blue-500" /> DOCX
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className={`rounded-xl shadow-lg gap-1.5 transition-all ${
              saved
                ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
                : "bg-[#0055FF] hover:bg-[#0044CC] shadow-blue-500/20"
            }`}
            data-testid="save-ata-btn"
          >
            {saved ? (
              <><CheckCircle size={15} weight="fill" /> Salvo</>
            ) : saving ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando…</>
            ) : (
              <><FloppyDisk size={15} /> Salvar</>
            )}
          </Button>
        </div>
      </header>

      {/* ── Tabs ── */}
      <Tabs defaultValue="ata" className="fade-up-delay-1">
        <TabsList className="mb-5 bg-white border border-slate-200/80 rounded-xl p-1 shadow-sm">
          <TabsTrigger
            value="ata"
            className="rounded-lg data-[state=active]:bg-[#0055FF] data-[state=active]:text-white data-[state=active]:shadow"
            data-testid="tab-ata"
          >
            Ata Completa
          </TabsTrigger>
          <TabsTrigger
            value="summary"
            className="rounded-lg data-[state=active]:bg-[#0055FF] data-[state=active]:text-white data-[state=active]:shadow"
            data-testid="tab-summary"
          >
            Resumo Executivo
          </TabsTrigger>
          <TabsTrigger
            value="next"
            className="rounded-lg data-[state=active]:bg-[#0055FF] data-[state=active]:text-white data-[state=active]:shadow"
            data-testid="tab-next"
          >
            Próxima Pauta
          </TabsTrigger>
          <TabsTrigger
            value="quality"
            className="rounded-lg data-[state=active]:bg-[#0055FF] data-[state=active]:text-white data-[state=active]:shadow flex items-center gap-1.5"
            data-testid="tab-quality"
          >
            <Gauge size={14} /> Qualidade
          </TabsTrigger>
          <TabsTrigger
            value="agent"
            className="rounded-lg data-[state=active]:bg-[#0055FF] data-[state=active]:text-white data-[state=active]:shadow flex items-center gap-1.5"
            data-testid="tab-agent"
          >
            <Robot size={14} /> Agente IA
          </TabsTrigger>
        </TabsList>

        {/* ── Full ATA ── */}
        <TabsContent value="ata">
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 flex-wrap">
              <div className="flex items-center">
                <button
                  onClick={() => exec("bold")}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 text-slate-600 font-bold transition-colors"
                  title="Negrito"
                  data-testid="format-bold"
                >
                  <TextBolder size={15} weight="bold" />
                </button>
                <button
                  onClick={() => exec("italic")}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 text-slate-600 transition-colors italic"
                  title="Itálico"
                  data-testid="format-italic"
                >
                  <TextItalic size={15} />
                </button>
                <button
                  onClick={() => exec("underline")}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 text-slate-600 transition-colors underline"
                  title="Sublinhado"
                  data-testid="format-underline"
                >
                  <TextUnderline size={15} />
                </button>
              </div>

              <div className="w-px h-5 bg-slate-200 mx-1.5" />

              <div className="flex items-center">
                <button
                  onClick={() => exec("insertUnorderedList")}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 text-slate-600 transition-colors"
                  title="Lista"
                  data-testid="format-ul"
                >
                  <ListBullets size={15} />
                </button>
                <button
                  onClick={() => exec("insertOrderedList")}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 text-slate-600 transition-colors"
                  title="Lista numerada"
                  data-testid="format-ol"
                >
                  <ListNumbers size={15} />
                </button>
              </div>

              <div className="w-px h-5 bg-slate-200 mx-1.5" />

              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => exec("formatBlock", "h2")}
                  className="px-2.5 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 text-xs font-bold text-slate-600 transition-colors"
                  title="Título H2"
                  data-testid="format-h2"
                >
                  H2
                </button>
                <button
                  onClick={() => exec("formatBlock", "h3")}
                  className="px-2.5 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 text-xs font-bold text-slate-600 transition-colors"
                  title="Título H3"
                  data-testid="format-h3"
                >
                  H3
                </button>
                <button
                  onClick={() => exec("formatBlock", "p")}
                  className="px-2.5 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 text-xs text-slate-600 transition-colors"
                  title="Parágrafo"
                >
                  P
                </button>
              </div>
            </div>

            {/* Editor area */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="p-10 min-h-[60vh] focus:outline-none bg-white"
              style={{
                fontFamily: "IBM Plex Sans, sans-serif",
                lineHeight: 1.75,
                color: "#334155",
                fontSize: "15px",
              }}
              data-testid="ata-editor"
            />
          </div>
        </TabsContent>

        {/* ── Executive summary ── */}
        <TabsContent value="summary">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                <Sparkle size={13} className="text-[#0055FF]" weight="fill" />
              </div>
              <div className="label-eyebrow">Resumo Executivo gerado por IA</div>
            </div>
            <p
              className="text-slate-700 leading-relaxed text-lg"
              data-testid="executive-summary"
            >
              {meeting.executive_summary || (
                <span className="italic text-slate-400">
                  Resumo ainda não gerado. Gere a ata completa primeiro.
                </span>
              )}
            </p>
          </div>
        </TabsContent>

        {/* ── Next agenda ── */}
        <TabsContent value="next">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                <CalendarBlank size={13} className="text-[#0055FF]" weight="bold" />
              </div>
              <div className="label-eyebrow">Sugestão de pauta — Próxima reunião</div>
            </div>
            <div
              className="text-slate-700 leading-relaxed"
              style={{ fontFamily: "IBM Plex Sans, sans-serif" }}
              dangerouslySetInnerHTML={{
                __html: meeting.next_agenda || "<p class='text-slate-400 italic'>Não gerado ainda.</p>",
              }}
              data-testid="next-agenda"
            />
          </div>
        </TabsContent>

        {/* ── Quality scores ── */}
        <TabsContent value="quality">
          <QualityPanel meetingId={id} />
        </TabsContent>

        {/* ── Agent ── */}
        <TabsContent value="agent">
          <AgentPanel meetingId={id} onMeetingUpdate={refreshEditor} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
