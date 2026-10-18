import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { isPersistent, requestPersistence } from "@/lib/audioStore";
import { SegmentRecorder, microphoneErrorMessage, extensionFor } from "@/lib/segmentRecorder";
import { UploadQueue } from "@/lib/uploadQueue";
import useWakeLock from "@/hooks/useWakeLock";
import UploadRecordingDialog from "@/components/UploadRecordingDialog";
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
  CloudArrowUp,
  WarningCircle,
  UploadSimple,
  DownloadSimple,
  ArrowClockwise,
  Trash,
  NotePencil,
} from "@phosphor-icons/react";

const BAR_SHAPE = [0.35, 0.6, 0.85, 0.5, 1, 0.7, 0.45, 0.9, 0.55, 0.8, 0.4, 0.65];

function LevelBars({ level, active }) {
  return (
    <div className="flex items-center justify-center gap-0.5 h-8" aria-hidden="true">
      {BAR_SHAPE.map((f, i) => (
        <span
          key={i}
          className="inline-block rounded-full transition-[height] duration-100"
          style={{
            width: 3,
            background: active ? "#FF3B30" : "#CBD5E1",
            height: active ? Math.max(4, Math.min(32, 4 + level * 40 * f)) : 4,
          }}
        />
      ))}
    </div>
  );
}

function formatClock(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${ss}` : `${m}:${ss}`;
}

// Duração de cada trecho. Pode ser ajustada para testes em localStorage("atas_segment_ms").
function segmentMs() {
  try {
    const v = Number(window.localStorage.getItem("atas_segment_ms"));
    if (v >= 5000 && v <= 120000) return v;
  } catch {
    /* sem localStorage */
  }
  return 45000;
}

const EMPTY_QUEUE = { pending: 0, failed: 0, uploading: false, waiting: false, error: "", authExpired: false };

export default function ConductMeeting() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [activeTopicIdx, setActiveTopicIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [queue, setQueue] = useState(EMPTY_QUEUE);
  const [finalizingIds, setFinalizingIds] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [notes, setNotes] = useState({});
  const [savingNote, setSavingNote] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [job, setJob] = useState(null);
  const [persistent, setPersistent] = useState(true);

  const recorderRef = useRef(null);
  const queueRef = useRef(null);
  const pendingAddsRef = useRef(new Set());
  const startedAtRef = useRef(0);
  const lastLevelRef = useRef(0);

  useWakeLock(recording);

  const appendLocal = useCallback((topicId, text) => {
    setMeeting((m) =>
      m && {
        ...m,
        agenda: m.agenda.map((t) =>
          t.id === topicId
            ? {
                ...t,
                transcription: `${t.transcription || ""} ${text}`.trim(),
                status: t.status === "pending" ? "in_progress" : t.status,
              }
            : t,
        ),
      },
    );
  }, []);

  const load = useCallback(
    async (selectFirstPending = false) => {
      const { data } = await api.get(`/meetings/${id}`);
      setMeeting(data);
      if (selectFirstPending) {
        const i = data.agenda.findIndex((t) => t.status !== "completed");
        setActiveTopicIdx(i >= 0 ? i : Math.max(0, data.agenda.length - 1));
      }
      return data;
    },
    [id],
  );

  // Abre a fila (envia também trechos que ficaram guardados de uma sessão anterior).
  useEffect(() => {
    load(true).catch(() => toast.error("Não foi possível carregar a reunião"));
    const q = new UploadQueue(id, { onTranscribed: appendLocal });
    queueRef.current = q;
    const unsubscribe = q.subscribe(setQueue);
    q.kick();
    isPersistent().then(setPersistent);
    requestPersistence();
    api
      .get(`/meetings/${id}/jobs`)
      .then(({ data }) => {
        const running = data.find((j) => j.status === "queued" || j.status === "running");
        if (running) setJob(running);
      })
      .catch(() => {});
    return () => {
      unsubscribe();
      const rec = recorderRef.current;
      recorderRef.current = null;
      rec?.stop(); // o último trecho fica guardado no aparelho e é enviado na próxima abertura
      q.close();
    };
  }, [id, load, appendLocal]);

  // Cronômetro da gravação.
  useEffect(() => {
    if (!recording) return undefined;
    const t = setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Avisa antes de fechar a aba com gravação em andamento ou trechos não enviados.
  useEffect(() => {
    if (!recording && queue.pending === 0) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [recording, queue.pending]);

  // Acompanha a transcrição de uma gravação enviada.
  const jobId = job?.id;
  const jobStatus = job?.status;
  useEffect(() => {
    if (!jobId || jobStatus === "done" || jobStatus === "failed") return undefined;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get(`/meetings/${id}/jobs/${jobId}`);
        setJob(data);
        if (data.status === "done") {
          toast.success(`Gravação transcrita (${data.result?.words || 0} palavras)`);
          if (data.result?.warning) toast.warning(data.result.warning, { duration: 10000 });
          load();
        } else if (data.status === "failed") {
          toast.error(data.error || "Falha ao transcrever a gravação", { duration: 10000 });
        }
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [id, jobId, jobStatus, load]);

  const handleLevel = useCallback((value) => {
    if (Math.abs(value - lastLevelRef.current) > 0.03 || value === 0) {
      lastLevelRef.current = value;
      setLevel(value);
    }
  }, []);

  const handleSegment = useCallback((info) => {
    if (!info.hadSpeech) return; // trecho só com silêncio: não envia
    const q = queueRef.current;
    if (!q) return;
    const p = q.add(info).catch(() => toast.error("Não foi possível guardar um trecho de áudio no aparelho"));
    pendingAddsRef.current.add(p);
    p.finally(() => pendingAddsRef.current.delete(p));
  }, []);

  const stopRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setRecording(false);
    await rec.stop();
  }, []);

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

  const agenda = meeting.agenda;
  if (agenda.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-slate-600">Esta reunião não tem itens de pauta. Cadastre a pauta antes de conduzir.</p>
        <Button variant="outline" onClick={() => navigate(`/meetings/${id}`)}>Voltar</Button>
      </div>
    );
  }

  const activeTopic = agenda[Math.min(activeTopicIdx, agenda.length - 1)];
  const isFinalizing = (topicId) => finalizingIds.includes(topicId);
  const completedCount = agenda.filter((t) => t.status === "completed").length;
  const allCompleted = completedCount === agenda.length;
  const progressPct = (completedCount / agenda.length) * 100;
  const busy = finalizingIds.length > 0 || queue.pending > 0;
  const nextOpenIdx = agenda.findIndex(
    (t, i) => i > activeTopicIdx && t.status !== "completed" && !isFinalizing(t.id),
  );
  const note = notes[activeTopic.id] || "";
  const jobRunning = job && (job.status === "queued" || job.status === "running");

  const startRecording = async () => {
    setStarting(true);
    const rec = new SegmentRecorder({
      segmentMs: segmentMs(),
      onSegment: handleSegment,
      onLevel: handleLevel,
      onInterrupted: (msg) => {
        toast.error(msg);
        stopRecording();
      },
    });
    try {
      await rec.start(activeTopic.id);
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      if (meeting.status === "scheduled") {
        api.post(`/meetings/${id}/start`).catch(() => {});
      }
    } catch (err) {
      toast.error(microphoneErrorMessage(err), { duration: 8000 });
    } finally {
      setStarting(false);
    }
  };

  const goToTopic = (idx) => {
    const target = agenda[idx];
    if (idx === activeTopicIdx) return;
    if (recorderRef.current) {
      if (target.status === "completed" || isFinalizing(target.id)) {
        toast("Pare a gravação para revisar itens já encerrados.");
        return;
      }
      recorderRef.current.rotate(target.id); // a gravação continua, agora neste item
    }
    setActiveTopicIdx(idx);
  };

  const saveNote = async (topicId) => {
    const text = (notes[topicId] || "").trim();
    if (!text) return;
    await api.post(`/meetings/${id}/topics/${topicId}/note`, { text });
    setNotes((n) => ({ ...n, [topicId]: "" }));
  };

  const addNoteNow = async () => {
    setSavingNote(true);
    try {
      await saveNote(activeTopic.id);
      await load();
      toast.success("Anotação acrescentada");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar a anotação");
    } finally {
      setSavingNote(false);
    }
  };

  // Resume o item com IA depois que todos os trechos dele forem transcritos.
  const finalizeTopic = async (topicId) => {
    setFinalizingIds((ids) => [...ids, topicId]);
    try {
      await saveNote(topicId);
      await Promise.allSettled([...pendingAddsRef.current]);
      await queueRef.current?.waitForTopic(topicId);
      await api.post(`/meetings/${id}/topics/${topicId}/finalize`);
      await load();
      toast.success("Item encerrado e resumido");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao encerrar o item. Tente de novo.");
    } finally {
      setFinalizingIds((ids) => ids.filter((x) => x !== topicId));
    }
  };

  const finishTopic = async () => {
    const current = activeTopic;
    if (recorderRef.current) {
      if (nextOpenIdx >= 0) recorderRef.current.rotate(agenda[nextOpenIdx].id);
      else await stopRecording(); // era o último item: para a gravação
    }
    if (nextOpenIdx >= 0) setActiveTopicIdx(nextOpenIdx);
    finalizeTopic(current.id);
  };

  const generateAta = async () => {
    setGenerating(true);
    try {
      await api.post(`/meetings/${id}/generate-ata`);
      toast.success("Ata gerada com sucesso!");
      navigate(`/meetings/${id}/ata`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao gerar ata");
    } finally {
      setGenerating(false);
    }
  };

  const downloadFailed = async () => {
    const failed = await queueRef.current.failedSegments();
    failed.forEach((s, i) => {
      const url = URL.createObjectURL(s.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reuniao-${meeting.number}-trecho-${i + 1}.${extensionFor(s.mime)}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  };

  const exit = async () => {
    if (recorderRef.current) await stopRecording();
    navigate(`/meetings/${id}`);
  };

  const ataButton = allCompleted && (
    <Button
      onClick={generateAta}
      disabled={generating || busy}
      className="bg-[#0055FF] hover:bg-[#0044CC] rounded-xl shadow-lg shadow-blue-500/20"
      data-testid="generate-ata-btn"
    >
      <Sparkle size={16} weight="fill" />
      {generating ? "Gerando ata…" : "Gerar Ata com IA"}
    </Button>
  );

  return (
    <div className="h-screen flex flex-col bg-[#F0F2F5]" data-testid="conduct-page">
      {/* ── Cabeçalho ── */}
      <header className="glass sticky top-0 z-10 border-b border-slate-200/80 px-4 md:px-6 py-3 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={exit}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors flex-shrink-0"
            data-testid="exit-btn"
            aria-label="Sair da condução"
          >
            <X size={16} />
          </button>
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
              ATA #{String(meeting.number).padStart(3, "0")}
            </div>
            <div className="font-semibold text-sm text-slate-900 truncate">{meeting.title}</div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <div className="text-xs text-slate-500 font-medium">
            {completedCount}/{agenda.length} itens
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

        <div className="flex items-center gap-2 flex-shrink-0">
          {recording && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200">
              <span className="w-2 h-2 rounded-full bg-[#FF3B30] recording-pulse" />
              <span className="text-xs font-bold text-red-700 tracking-wide font-mono">{formatClock(elapsed)}</span>
            </div>
          )}
          {queue.pending > 0 && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1.5 hidden sm:inline-flex">
              <CloudArrowUp size={12} weight="bold" />
              {queue.pending} {queue.pending === 1 ? "trecho" : "trechos"}
            </Badge>
          )}
          <div className="hidden md:block">{ataButton}</div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Pauta (telas médias e grandes) ── */}
        <aside className="hidden md:block w-72 border-r border-slate-200/80 bg-white overflow-y-auto flex-shrink-0" data-testid="agenda-sidebar">
          <div className="p-4 border-b border-slate-100 sticky top-0 bg-white z-10">
            <div className="label-eyebrow mb-0.5">Ordem do dia</div>
            <div className="text-xs text-slate-500 mt-1">
              {completedCount} de {agenda.length} concluídos
            </div>
          </div>
          <div className="p-3 space-y-1.5">
            {agenda.map((t, i) => {
              const isActive = i === activeTopicIdx;
              const isDone = t.status === "completed";
              const working = isFinalizing(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => goToTopic(i)}
                  data-testid={`topic-${i}`}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-150 ${
                    isActive
                      ? "border-[#0055FF]/30 bg-blue-50/60 shadow-sm"
                      : isDone
                      ? "border-emerald-100 bg-emerald-50/30"
                      : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                        isDone ? "bg-emerald-500 text-white" : isActive ? "bg-[#0055FF] text-white shadow" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {working ? (
                        <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : isDone ? (
                        <CheckCircle size={12} weight="fill" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold truncate ${isActive ? "text-slate-900" : "text-slate-600"}`}>{t.title}</div>
                      {working && <div className="text-xs text-blue-600 mt-0.5">Resumindo…</div>}
                      {isDone && !working && t.summary && (
                        <div className="text-xs text-emerald-600 mt-0.5 line-clamp-1">{t.summary}</div>
                      )}
                      {recording && isActive && <div className="text-xs text-red-600 mt-0.5">Gravando neste item</div>}
                    </div>
                    {isActive && <CaretRight size={14} className="text-[#0055FF] flex-shrink-0 mt-1" />}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Conteúdo ── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8" data-testid="main-content">
          <div className="max-w-2xl mx-auto fade-up">
            {/* Pauta em formato compacto (celular) */}
            <div className="md:hidden -mx-4 px-4 mb-4 flex gap-2 overflow-x-auto pb-1" data-testid="agenda-chips">
              {agenda.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => goToTopic(i)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    i === activeTopicIdx
                      ? "bg-[#0055FF] text-white border-[#0055FF]"
                      : t.status === "completed"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  {t.status === "completed" ? "✓ " : `${i + 1}. `}
                  {t.title.length > 22 ? `${t.title.slice(0, 22)}…` : t.title}
                </button>
              ))}
            </div>

            {/* Avisos da fila de envio */}
            {!persistent && (recording || queue.pending > 0) && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
                <WarningCircle size={16} className="flex-shrink-0" />
                Este navegador não permite guardar o áudio no aparelho. Mantenha esta aba aberta até o envio terminar.
              </div>
            )}
            {(queue.pending > 0 || queue.error) && (
              <div
                className={`mb-4 rounded-xl border p-3 text-xs flex flex-wrap items-center gap-2 ${
                  queue.waiting || queue.authExpired ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"
                }`}
                data-testid="queue-status"
              >
                {queue.uploading ? (
                  <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CloudArrowUp size={16} />
                )}
                <span className="flex-1">
                  {queue.pending > 0 && (
                    <strong>
                      {queue.pending} {queue.pending === 1 ? "trecho aguardando" : "trechos aguardando"} transcrição.{" "}
                    </strong>
                  )}
                  {queue.error || (queue.pending > 0 && "Guardados neste aparelho até a confirmação.")}
                </span>
                {queue.authExpired && (
                  <Button size="sm" variant="outline" className="h-7 rounded-lg" onClick={() => queueRef.current.resumeAfterLogin()}>
                    Tentar de novo
                  </Button>
                )}
              </div>
            )}
            {queue.failed > 0 && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex flex-wrap items-center gap-2" data-testid="queue-failed">
                <WarningCircle size={16} />
                <span className="flex-1">
                  {queue.failed} {queue.failed === 1 ? "trecho não pôde" : "trechos não puderam"} ser transcritos.
                </span>
                <Button size="sm" variant="outline" className="h-7 rounded-lg gap-1" onClick={downloadFailed}>
                  <DownloadSimple size={12} /> Baixar áudio
                </Button>
                <Button size="sm" variant="outline" className="h-7 rounded-lg gap-1" onClick={() => queueRef.current.retryFailed()}>
                  <ArrowClockwise size={12} /> Tentar de novo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-lg gap-1 text-red-700"
                  onClick={() => window.confirm("Descartar o áudio destes trechos? Não há como recuperar.") && queueRef.current.discardFailed()}
                >
                  <Trash size={12} /> Descartar
                </Button>
              </div>
            )}
            {jobRunning && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800" data-testid="job-status">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <strong>Transcrevendo gravação enviada:</strong> {job.step}
                  {job.total > 0 && ` (${job.progress} de ${job.total} partes)`}
                </div>
                {job.total > 0 && (
                  <div className="h-1 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0055FF] transition-all" style={{ width: `${(job.progress / job.total) * 100}%` }} />
                  </div>
                )}
              </div>
            )}

            <div className="label-eyebrow mb-2 text-slate-400">
              Item {activeTopicIdx + 1} de {agenda.length}
            </div>
            <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight text-slate-900 mb-6">{activeTopic.title}</h1>

            {/* ── Gravador ── */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8 mb-5 flex flex-col items-center shadow-sm" data-testid="recorder-card">
              <div className="relative w-24 h-24 mb-5">
                <button
                  onClick={recording ? stopRecording : startRecording}
                  disabled={starting || (!recording && (activeTopic.status === "completed" || isFinalizing(activeTopic.id)))}
                  aria-label={recording ? "Parar gravação" : "Iniciar gravação"}
                  className={`relative z-10 w-full h-full rounded-full flex items-center justify-center transition-all ${
                    recording
                      ? "bg-[#FF3B30] hover:bg-[#E0342A] recording-pulse"
                      : activeTopic.status === "completed"
                      ? "bg-slate-200 cursor-not-allowed"
                      : "bg-[#0055FF] hover:bg-[#0044CC] blue-glow-pulse shadow-xl shadow-blue-500/30"
                  } text-white disabled:opacity-50`}
                  data-testid="record-btn"
                >
                  {recording ? <Stop size={30} weight="fill" /> : <Microphone size={30} weight="fill" />}
                </button>
              </div>

              <div className="text-center">
                <div className="font-semibold text-slate-900 mb-1">
                  {activeTopic.status === "completed"
                    ? "Item encerrado"
                    : isFinalizing(activeTopic.id)
                    ? "Resumindo o item…"
                    : recording
                    ? "Gravando a reunião"
                    : starting
                    ? "Abrindo o microfone…"
                    : "Toque para gravar a reunião"}
                </div>
                <div className="text-xs text-slate-400 max-w-sm">
                  {recording
                    ? "A gravação segue entre os itens. Use o botão abaixo ao passar para o próximo item."
                    : "Transcrição automática em português, enviada a cada 45 segundos. A tela fica acesa durante a gravação."}
                </div>
              </div>

              {recording && (
                <div className="mt-5 w-full flex justify-center">
                  <LevelBars level={level} active />
                </div>
              )}

              {recording && (
                <Button
                  onClick={finishTopic}
                  className="mt-6 bg-slate-900 hover:bg-slate-800 rounded-xl"
                  data-testid="next-topic-btn"
                >
                  {nextOpenIdx >= 0 ? (
                    <>Encerrar item e ir para o próximo <ArrowRight size={16} /></>
                  ) : (
                    <>Encerrar último item e parar <Stop size={14} weight="fill" /></>
                  )}
                </Button>
              )}

              {!recording && (
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  disabled={jobRunning}
                  className="mt-5 text-xs font-semibold text-[#0055FF] hover:underline flex items-center gap-1 disabled:opacity-50 disabled:no-underline"
                  data-testid="open-upload-btn"
                >
                  <UploadSimple size={14} /> Já tem a gravação? Enviar arquivo (Zoom, Meet, Teams…)
                </button>
              )}
            </div>

            {/* ── Transcrição ── */}
            <div
              className={`bg-white rounded-2xl border mb-5 shadow-sm overflow-hidden ${
                recording ? "border-[#0055FF]/30 tracing-beam" : "border-slate-200/80"
              }`}
              data-testid="transcription-card"
            >
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="label-eyebrow">Transcrição</span>
                {activeTopic.transcription && (
                  <span className="text-xs text-slate-400">{activeTopic.transcription.split(/\s+/).length} palavras</span>
                )}
              </div>
              <div className="p-5 max-h-96 overflow-y-auto">
                {activeTopic.transcription ? (
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">{activeTopic.transcription}</p>
                ) : (
                  <p className="text-slate-400 italic text-sm">
                    {recording
                      ? "O texto aparece aqui a cada trecho de cerca de 45 segundos."
                      : "Inicie a gravação ou envie um arquivo para ver a transcrição aqui."}
                  </p>
                )}
              </div>
            </div>

            {/* ── Anotação manual ── */}
            {activeTopic.status !== "completed" && !isFinalizing(activeTopic.id) && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 mb-5 shadow-sm">
                <div className="label-eyebrow mb-3">
                  Anotação manual <span className="text-slate-400 font-normal normal-case ml-1">(opcional)</span>
                </div>
                <Textarea
                  value={note}
                  onChange={(e) => setNotes((n) => ({ ...n, [activeTopic.id]: e.target.value }))}
                  placeholder="Ex.: votação unânime; valor exato aprovado; quem se absteve…"
                  rows={3}
                  className="resize-none rounded-xl border-slate-200 text-sm"
                  data-testid="manual-note-input"
                />
                {note.trim() && (
                  <div className="flex justify-end mt-2">
                    <Button size="sm" variant="outline" className="rounded-lg gap-1" disabled={savingNote} onClick={addNoteNow}>
                      <NotePencil size={14} /> {savingNote ? "Salvando…" : "Acrescentar à transcrição"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Resumo do item ── */}
            {activeTopic.status === "completed" && (
              <div className="bg-emerald-50/40 rounded-2xl border border-emerald-200/60 p-5 mb-5" data-testid="topic-summary">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <CheckCircle size={14} weight="fill" className="text-white" />
                  </div>
                  <span className="font-semibold text-emerald-800 text-sm">Item resumido pela IA</span>
                </div>
                <div className="space-y-3 text-sm">
                  {[
                    ["Discussão", activeTopic.summary],
                    ["Deliberação", activeTopic.deliberation],
                    ["Encaminhamento", activeTopic.encaminhamento],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, value]) => (
                      <div key={label} className="bg-white/60 rounded-xl p-3">
                        <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">{label}</div>
                        <div className="text-slate-700">{value}</div>
                      </div>
                    ))}
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

            {/* ── Ações ── */}
            <div className="flex flex-wrap justify-end gap-3 pb-8">
              {!recording && activeTopic.status !== "completed" && (
                <Button
                  onClick={finishTopic}
                  disabled={isFinalizing(activeTopic.id)}
                  className="bg-[#0055FF] hover:bg-[#0044CC] rounded-xl shadow-lg shadow-blue-500/20"
                  data-testid="finalize-topic-btn"
                >
                  {isFinalizing(activeTopic.id) ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Encerrando…
                    </span>
                  ) : (
                    <>
                      Encerrar item <ArrowRight size={16} />
                    </>
                  )}
                </Button>
              )}
              {ataButton}
            </div>
          </div>
        </main>
      </div>

      <UploadRecordingDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        meetingId={id}
        agenda={agenda}
        onUploaded={setJob}
      />
    </div>
  );
}
