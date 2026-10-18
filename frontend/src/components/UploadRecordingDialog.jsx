import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UploadSimple, FileAudio } from "@phosphor-icons/react";

const ACCEPT = "audio/*,video/*,.mp3,.m4a,.mp4,.wav,.webm,.ogg,.opus,.aac,.flac,.mov,.mkv,.wma,.amr,.3gp";

function formatSize(bytes) {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

export default function UploadRecordingDialog({ open, onOpenChange, meetingId, agenda, onUploaded }) {
  const [file, setFile] = useState(null);
  const [target, setTarget] = useState("all");
  const [progress, setProgress] = useState(null);
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setProgress(null);
    setTarget("all");
  };

  const submit = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (target !== "all") fd.append("topic_id", target);
    setProgress(0);
    try {
      const { data } = await api.post(`/meetings/${meetingId}/recordings`, fd, {
        timeout: 0,
        onUploadProgress: (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100)),
      });
      toast.success("Gravação recebida. A transcrição continua mesmo se você sair desta tela.");
      onUploaded?.(data);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Falha ao enviar a gravação");
      setProgress(null);
    }
  };

  const uploading = progress !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (uploading) return;
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg rounded-2xl" data-testid="upload-recording-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Enviar gravação pronta</DialogTitle>
          <DialogDescription>
            Gravação do Zoom, Meet, Teams ou de um gravador. Áudio ou vídeo, até algumas horas de duração.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-slate-200 hover:border-[#0055FF]/50 rounded-xl p-6 flex flex-col items-center gap-2 text-center transition-colors"
          data-testid="recording-file-picker"
        >
          {file ? (
            <>
              <FileAudio size={28} className="text-[#0055FF]" />
              <span className="text-sm font-semibold text-slate-800 break-all">{file.name}</span>
              <span className="text-xs text-slate-400">{formatSize(file.size)} · toque para trocar</span>
            </>
          ) : (
            <>
              <UploadSimple size={28} className="text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Escolher arquivo</span>
              <span className="text-xs text-slate-400">mp3, m4a, mp4, wav, webm…</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          data-testid="recording-file-input"
        />

        <div>
          <label htmlFor="recording-target" className="text-xs font-semibold text-slate-600">
            O que tem nesta gravação?
          </label>
          <select
            id="recording-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={uploading}
            className="mt-1.5 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            data-testid="recording-target-select"
          >
            <option value="all">A reunião inteira (a IA separa por item da pauta)</option>
            {agenda.map((t, i) => (
              <option key={t.id} value={t.id}>
                Só o item {i + 1}: {t.title}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1.5">
            O texto é acrescentado ao que já foi transcrito. O arquivo é apagado do servidor após a transcrição.
          </p>
        </div>

        {uploading && (
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Enviando…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#0055FF] transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" disabled={uploading} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={!file || uploading}
            className="bg-[#0055FF] hover:bg-[#0044CC] rounded-xl"
            data-testid="recording-submit-btn"
          >
            {uploading ? "Enviando…" : "Enviar e transcrever"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
