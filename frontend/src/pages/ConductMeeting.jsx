import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Microphone,
  Stop,
  CheckCircle,
  CaretRight,
  Sparkle,
  ArrowRight,
  X,
} from "@phosphor-icons/react";

function WaveForm({ active }) {
  return (
    <div className="flex items-end justify-center gap-0.5 h-8">
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="inline-block rounded-full"
          style={{
            width: 3,
            background: active ? "#FF3B30" : "#CBD5E1",
            animationPlayState: active ? "running" : "paused",
            animationDelay: `${i * 0.07}s`,
            animation: "wave 0.9s ease-in-out infinite",
            height: active ? undefined : 6,
          }}
        />
      ))}
    </div>
  );
}

function ProgressRing({ value, size = 96, stroke = 5 }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size} className="absolute inset-0" style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={value >= 100 ? "#10B981" : "#0055FF"}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
    </svg>
  );
}

export default function ConductMeeting() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [activeTopicIdx, setActiveTopicIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const load = async () => {
    const { data } = await api.get(`/meetings/${id}`);
    setMeeting(data);
    const firstPending = data.agenda.findIndex((t) => t.status !== "completed");
    setActiveTopicIdx(firstPending >= 0 ? firstPending : data.agenda.length - 1);
  };

  useEffect(() => {
    load();
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, [id]); // eslint-disable-line

  if (!meeting) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-10 h-10 border-2 border-slate-200 border-t-[#0055FF] rounded-full animate-spin" />
          <span className="text-sm">Carregando reunião…</span>
        </div>
      </div>
    );
  }

  const activeTopic = meeting.agenda[activeTopicIdx];
  const allCompleted = meeting.agenda.every((t) => t.status === "completed");
  const completedCount = meeting.agenda.filter((t) => t.status === "completed").length;
  const progressPct = meeting.agenda.length > 0 ? (completedCount / meeting.agenda.length) * 100 : 0;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        await uploadAudio(blob, mime);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setProcessing(true);
    }
  };

  const uploadAudio = async (blob, mime) => {
    try {
      const ext = mime.includes("webm") ? "webm" : "m4a";
      const fd = new FormData();
      fd.append("file", blob, `topic-${activeTopic.id}.${ext}`);
      const { data } = await api.post(
        `/meetings/${id}/topics/${activeTopic.id}/transcribe`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      toast.success("Transcrição adicionada");
      setMeeting((m) => {
        const ag = [...m.agenda];
        ag[activeTopicIdx] = {
          ...ag[activeTopicIdx],
          transcription: (ag[activeTopicIdx].transcription || "") + " " + data.text,
        };
        return { ...m, agenda: ag };
      });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Falha na transcrição");
    } finally {
      setProcessing(false);
    }
  };

  const finalizeTopic = async () => {
    setFinalizing(true);
    try {
      if (manualNote.trim()) {
        await api.patch(`/meetings/${id}`, {
          agenda: meeting.agenda.map((t, idx) =>
            idx === activeTopicIdx
              ? { ...t, transcription: (t.transcription || "") + "\n\n[Nota manual]: " + manualNote }
              : t
          ),
        });
      }
      await api.post(`/meetings/${id}/topics/${activeTopic.id}/finalize`);
      toast.success("Tópico encerrado");
      setManualNote("");
      await load();
      const nextIdx = meeting.agenda.findIndex((t, i) => i > activeTopicIdx && t.status !== "completed");
      if (nextIdx >= 0) setActiveTopicIdx(nextIdx);
    } catch {
      toast.error("Erro ao encerrar tópico");
    } finally {
      setFinalizing(false);
    }
  };

  const generateAta = async () => {
    setFinalizing(true);
    try {
      await api.post(`/meetings/${id}/generate-ata`);
      toast.success("Ata gerada com sucesso!");
      navigate(`/meetings/${id}/ata`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao gerar ata");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#F0F2F5]" data-testid="conduct-page">

      {/* ── Sticky header ── */}
      <header className="glass sticky top-0 z-10 border-b border-slate-200/80 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/meetings/${id}`)}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
            data-testid="exit-btn"
          >
            <X size={16} />
          </button>
          <div>
            <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
              ATA #{String(meeting.number).padStart(3, "0")}
            </div>
            <div className="font-semibold text-sm text-slate-900">{meeting.title}</div>
          </div>
        </div>

        {/* Progress */}
        <div className="hidden md:flex items-center gap-3">
          <div className="text-xs text-slate-500 font-medium">
            {completedCount}/{meeting.agenda.length} tópicos
          </div>
          <div className="w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progressPct}%`,
                background: allCompleted
                  ? "linear-gradient(90deg, #10B981, #34D399)"
                  : "linear-gradient(90deg, #0055FF, #3B82F6)",
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {recording && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200">
              <span className="w-2 h-2 rounded-full bg-[#FF3B30] recording-pulse" />
              <span className="text-xs font-bold text-red-700 tracking-wide">GRAVANDO</span>
              <WaveForm active={recording} />
            </div>
          )}
          {processing && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1.5">
              <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
              Transcrevendo…
            </Badge>
          )}
          {allCompleted ? (
            <Button
              onClick={generateAta}
              disabled={finalizing}
              className="bg-[#0055FF] hover:bg-[#0044CC] rounded-xl shadow-lg shadow-blue-500/20"
              data-testid="generate-ata-btn"
            >
              <Sparkle size={16} weight="fill" />
              {finalizing ? "Gerando ata…" : "Gerar Ata com IA"}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Agenda sidebar ── */}
        <aside
          className="w-72 border-r border-slate-200/80 bg-white overflow-y-auto flex-shrink-0"
          data-testid="agenda-sidebar"
        >
          <div className="p-4 border-b border-slate-100 sticky top-0 bg-white z-10">
            <div className="label-eyebrow mb-0.5">Ordem do dia</div>
            <div className="text-xs text-slate-500 mt-1">
              {completedCount} de {meeting.agenda.length} concluídos
            </div>
          </div>

          <div className="p-3 space-y-1.5">
            {meeting.agenda.map((t, i) => {
              const isActive = i === activeTopicIdx;
              const isDone = t.status === "completed";
              const isLocked = i > activeTopicIdx && meeting.agenda.slice(0, i).some((x) => x.status !== "completed");
              return (
                <button
                  key={t.id}
                  onClick={() => !isLocked && setActiveTopicIdx(i)}
                  disabled={isLocked}
                  data-testid={`topic-${i}`}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-150 ${
                    isActive
                      ? "border-[#0055FF]/30 bg-blue-50/60 shadow-sm"
                      : isDone
                      ? "border-emerald-100 bg-emerald-50/30"
                      : isLocked
                      ? "border-slate-100 bg-slate-50/50 opacity-40 cursor-not-allowed"
                      : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                        isDone
                          ? "bg-emerald-500 text-white"
                          : isActive
                          ? "bg-[#0055FF] text-white shadow"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {isDone ? <CheckCircle size={12} weight="fill" /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold truncate ${isActive ? "text-slate-900" : "text-slate-600"}`}>
                        {t.title}
                      </div>
                      {isDone && t.summary && (
                        <div className="text-xs text-emerald-600 mt-0.5 line-clamp-1">{t.summary}</div>
                      )}
                    </div>
                    {isActive && <CaretRight size={14} className="text-[#0055FF] flex-shrink-0 mt-1" />}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto p-8" data-testid="main-content">
          <div className="max-w-2xl mx-auto fade-up">
            <div className="label-eyebrow mb-2 text-slate-400">
              Tópico {activeTopicIdx + 1} de {meeting.agenda.length}
            </div>
            <h1 className="font-display font-black text-3xl tracking-tight text-slate-900 mb-6">
              {activeTopic.title}
            </h1>

            {/* ── Recorder ── */}
            <div
              className="bg-white rounded-2xl border border-slate-200/80 p-8 mb-5 flex flex-col items-center shadow-sm"
              data-testid="recorder-card"
            >
              {/* Mic button with progress ring */}
              <div className="relative w-24 h-24 mb-5">
                <button
                  onClick={recording ? stopRecording : startRecording}
                  disabled={processing || activeTopic.status === "completed"}
                  className={`relative z-10 w-full h-full rounded-full flex items-center justify-center transition-all ${
                    recording
                      ? "bg-[#FF3B30] hover:bg-[#E0342A] recording-pulse"
                      : activeTopic.status === "completed"
                      ? "bg-slate-200 cursor-not-allowed"
                      : "bg-[#0055FF] hover:bg-[#0044CC] blue-glow-pulse shadow-xl shadow-blue-500/30"
                  } text-white disabled:opacity-50`}
                  data-testid="record-btn"
                >
                  {recording ? (
                    <Stop size={30} weight="fill" />
                  ) : (
                    <Microphone size={30} weight="fill" />
                  )}
                </button>
              </div>

              <div className="text-center">
                <div className="font-semibold text-slate-900 mb-1">
                  {activeTopic.status === "completed"
                    ? "Tópico encerrado"
                    : recording
                    ? "Gravando… toque para parar"
                    : processing
                    ? "Processando áudio…"
                    : "Toque para iniciar gravação"}
                </div>
                <div className="text-xs text-slate-400">
                  {processing ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Whisper AI transcrevendo…
                    </span>
                  ) : (
                    "Powered by Whisper AI · Português"
                  )}
                </div>
              </div>

              {recording && (
                <div className="mt-5 w-full flex justify-center">
                  <WaveForm active={recording} />
                </div>
              )}
            </div>

            {/* ── Transcription ── */}
            <div
              className={`bg-white rounded-2xl border mb-5 shadow-sm overflow-hidden ${
                recording ? "border-[#0055FF]/30 tracing-beam" : "border-slate-200/80"
              }`}
              data-testid="transcription-card"
            >
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="label-eyebrow">Transcrição</span>
                {activeTopic.transcription && (
                  <span className="text-xs text-slate-400">
                    {activeTopic.transcription.split(" ").length} palavras
                  </span>
                )}
              </div>
              <div className="p-5">
                {activeTopic.transcription ? (
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">
                    {activeTopic.transcription}
                  </p>
                ) : (
                  <p className="text-slate-400 italic text-sm">
                    Inicie a gravação para ver a transcrição aparecer aqui em tempo real.
                  </p>
                )}
              </div>
            </div>

            {/* ── Manual note ── */}
            {activeTopic.status !== "completed" && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 mb-5 shadow-sm">
                <div className="label-eyebrow mb-3">Anotação manual <span className="text-slate-400 font-normal normal-case ml-1">(opcional)</span></div>
                <Textarea
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Acrescente observações que a IA deve considerar ao gerar o resumo…"
                  rows={3}
                  className="resize-none rounded-xl border-slate-200 text-sm"
                  data-testid="manual-note-input"
                />
              </div>
            )}

            {/* ── Topic summary ── */}
            {activeTopic.status === "completed" && (
              <div
                className="bg-emerald-50/40 rounded-2xl border border-emerald-200/60 p-5 mb-5"
                data-testid="topic-summary"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <CheckCircle size={14} weight="fill" className="text-white" />
                  </div>
                  <span className="font-semibold text-emerald-800 text-sm">Tópico encerrado pela IA</span>
                </div>
                <div className="space-y-3 text-sm">
                  {activeTopic.summary && (
                    <div className="bg-white/60 rounded-xl p-3">
                      <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Discussão</div>
                      <div className="text-slate-700">{activeTopic.summary}</div>
                    </div>
                  )}
                  {activeTopic.deliberation && (
                    <div className="bg-white/60 rounded-xl p-3">
                      <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Deliberação</div>
                      <div className="text-slate-700">{activeTopic.deliberation}</div>
                    </div>
                  )}
                  {activeTopic.encaminhamento && (
                    <div className="bg-white/60 rounded-xl p-3">
                      <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Encaminhamento</div>
                      <div className="text-slate-700">{activeTopic.encaminhamento}</div>
                    </div>
                  )}
                  <div className="flex gap-4">
                    {activeTopic.responsible && (
                      <div>
                        <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-0.5">Responsável</div>
                        <div className="text-slate-700 text-sm">{activeTopic.responsible}</div>
                      </div>
                    )}
                    {activeTopic.deadline && (
                      <div>
                        <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-0.5">Prazo</div>
                        <div className="text-slate-700 text-sm">{activeTopic.deadline}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Actions ── */}
            {activeTopic.status !== "completed" && (
              <div className="flex justify-end gap-3">
                {allCompleted ? (
                  <Button
                    onClick={generateAta}
                    disabled={finalizing}
                    className="bg-[#0055FF] hover:bg-[#0044CC] rounded-xl shadow-lg shadow-blue-500/20"
                    data-testid="generate-ata-btn"
                  >
                    <Sparkle size={16} weight="fill" />
                    {finalizing ? "Gerando ata…" : "Gerar Ata Completa"}
                  </Button>
                ) : (
                  <Button
                    onClick={finalizeTopic}
                    disabled={finalizing || recording || processing}
                    className="bg-[#0055FF] hover:bg-[#0044CC] rounded-xl shadow-lg shadow-blue-500/20"
                    data-testid="finalize-topic-btn"
                  >
                    {finalizing ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Encerrando…
                      </span>
                    ) : (
                      <>Encerrar Tópico <ArrowRight size={16} /></>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
