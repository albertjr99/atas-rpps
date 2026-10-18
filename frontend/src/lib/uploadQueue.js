// Fila de envio dos trechos gravados, em ordem, com nova tentativa automática.
//
// Cada trecho é salvo no aparelho (IndexedDB) ANTES de qualquer envio e só é apagado
// depois que o servidor confirma a transcrição. O id do trecho vai junto: se a resposta
// se perder e o trecho for reenviado, o servidor reconhece e não duplica o texto.

import { api } from "@/lib/api";
import { deleteSegment, listSegments, putSegment } from "@/lib/audioStore";
import { extensionFor } from "@/lib/segmentRecorder";

const RETRY_DELAYS = [2000, 4000, 8000, 15000, 30000];

function newId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isTransient(err) {
  const status = err?.response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
}

export class UploadQueue {
  constructor(meetingId, { onTranscribed } = {}) {
    this.meetingId = meetingId;
    this.onTranscribed = onTranscribed;
    this.listeners = new Set();
    this.running = false;
    this.closed = false;
    this.retryTimer = null;
    this.wakeRetry = null;
    this.seq = Date.now();
    this.state = { pending: 0, failed: 0, uploading: false, waiting: false, error: "", authExpired: false };
    this.topicWaiters = [];
    this._online = () => this.kick(true);
    window.addEventListener("online", this._online);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  _set(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  async _refreshCounts() {
    const items = await listSegments(this.meetingId);
    const pending = items.filter((s) => s.status !== "failed");
    this._set({ pending: pending.length, failed: items.length - pending.length });
    this.topicWaiters = this.topicWaiters.filter(({ topicId, resolve }) => {
      if (pending.some((s) => s.topicId === topicId)) return true;
      resolve();
      return false;
    });
    return items;
  }

  // Guarda o trecho no aparelho e dispara o envio.
  async add({ blob, mime, topicId, durationMs }) {
    this.seq = Math.max(this.seq + 1, Date.now());
    await putSegment({
      id: newId(),
      meetingId: this.meetingId,
      topicId,
      seq: this.seq,
      mime,
      blob,
      durationMs: Math.round(durationMs || 0),
      createdAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
    });
    await this._refreshCounts();
    this.kick();
  }

  // Resolve quando não houver mais trechos pendentes deste item (falhas definitivas não contam).
  async waitForTopic(topicId) {
    const items = await this._refreshCounts();
    if (!items.some((s) => s.topicId === topicId && s.status !== "failed")) return;
    await new Promise((resolve) => this.topicWaiters.push({ topicId, resolve }));
  }

  kick(resetBackoff = false) {
    if (resetBackoff && this.wakeRetry) {
      clearTimeout(this.retryTimer);
      const wake = this.wakeRetry;
      this.wakeRetry = null;
      wake();
      return;
    }
    if (!this.running && !this.closed) this._run();
  }

  async _run() {
    this.running = true;
    try {
      for (;;) {
        if (this.closed || this.state.authExpired) break;
        const items = await this._refreshCounts();
        const next = items.find((s) => s.status !== "failed");
        if (!next) break;
        this._set({ uploading: true, waiting: false });
        try {
          const fd = new FormData();
          fd.append("file", next.blob, `trecho-${next.seq}.${extensionFor(next.mime)}`);
          fd.append("chunk_id", next.id);
          fd.append("seq", String(next.seq));
          fd.append("duration_ms", String(next.durationMs || 0));
          const { data } = await api.post(
            `/meetings/${this.meetingId}/topics/${next.topicId}/transcribe`,
            fd,
            { skipAuthRedirect: true, timeout: 120000 },
          );
          await deleteSegment(next.id);
          this._set({ error: "" });
          if (!data.duplicate && data.text) this.onTranscribed?.(next.topicId, data.text);
        } catch (err) {
          const status = err?.response?.status;
          const detail = err?.response?.data?.detail;
          if (status === 401) {
            this._set({ authExpired: true, error: "Sua sessão expirou. Entre de novo em outra aba; os trechos estão guardados neste aparelho." });
            break;
          }
          if (isTransient(err)) {
            const attempts = (next.attempts || 0) + 1;
            await putSegment({ ...next, attempts });
            const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
            this._set({
              uploading: false,
              waiting: true,
              error: !status ? "Sem conexão. Os trechos ficam guardados e serão enviados quando a rede voltar." : detail || "Falha temporária ao transcrever. Tentando de novo…",
            });
            await new Promise((resolve) => {
              this.wakeRetry = resolve;
              this.retryTimer = setTimeout(resolve, delay);
            });
            this.wakeRetry = null;
            continue;
          }
          // Erro definitivo (ex.: item da pauta excluído, arquivo inválido): guarda para o usuário decidir.
          await putSegment({ ...next, status: "failed", error: detail || `Erro ${status}` });
          this._set({ error: detail || "Um trecho não pôde ser transcrito." });
        }
      }
    } finally {
      this.running = false;
      this._set({ uploading: false, waiting: false });
      await this._refreshCounts();
    }
  }

  async failedSegments() {
    return (await listSegments(this.meetingId)).filter((s) => s.status === "failed");
  }

  async retryFailed() {
    const failed = await this.failedSegments();
    await Promise.all(failed.map((s) => putSegment({ ...s, status: "pending", attempts: 0 })));
    this._set({ authExpired: false, error: "" });
    await this._refreshCounts();
    this.kick();
  }

  async discardFailed() {
    const failed = await this.failedSegments();
    await Promise.all(failed.map((s) => deleteSegment(s.id)));
    await this._refreshCounts();
  }

  resumeAfterLogin() {
    this._set({ authExpired: false, error: "" });
    this.kick();
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    this.wakeRetry?.();
    window.removeEventListener("online", this._online);
    this.listeners.clear();
  }
}
