// Gravação contínua em trechos independentes.
//
// O MediaRecorder com `timeslice` gera pedaços que só funcionam juntos (só o primeiro tem
// cabeçalho), e a API de transcrição rejeita os demais. Por isso cada trecho é um
// MediaRecorder novo sobre o mesmo microfone: o anterior para e o seguinte começa na hora,
// e cada trecho vira um arquivo completo que pode ser enviado e transcrito sozinho.

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

// Nível (RMS) a partir do qual consideramos que há som. Só trechos praticamente mudos
// (sem nenhum meio segundo acima disso) deixam de ser enviados: evita custo e as "frases
// fantasmas" que a IA inventa no silêncio. O limite é baixo de propósito — perder uma fala
// distante do microfone é pior do que pagar por um trecho silencioso.
const SPEECH_RMS = 0.005;
const SPEECH_MIN_FRAMES = 5; // 5 leituras de 100 ms

export function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
}

export function extensionFor(mime) {
  if (!mime) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function microphoneErrorMessage(err) {
  if (!window.isSecureContext) return "A gravação exige conexão segura (HTTPS). Abra o sistema pelo endereço https.";
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return "Este navegador não permite gravar áudio. Use Chrome, Edge ou Safari atualizados.";
  }
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permissão do microfone negada. Libere o microfone nas configurações do navegador e tente de novo.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Nenhum microfone encontrado neste aparelho.";
    case "NotReadableError":
      return "O microfone está em uso por outro aplicativo (ex.: chamada ou Zoom).";
    default:
      return "Não foi possível acessar o microfone.";
  }
}

export class SegmentRecorder {
  constructor({ segmentMs = 45000, onSegment, onLevel, onInterrupted } = {}) {
    this.segmentMs = segmentMs;
    this.onSegment = onSegment;
    this.onLevel = onLevel;
    this.onInterrupted = onInterrupted;
    this.stream = null;
    this.current = null;
    this.timer = null;
    this.levelTimer = null;
    this.audioCtx = null;
    this.analyser = null;
    this.mime = "";
    this.active = false;
  }

  async start(topicId) {
    this.mime = pickMimeType();
    if (this.mime === null) throw new Error("MediaRecorder indisponível");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (this.active) this.onInterrupted?.("O microfone foi desconectado ou interrompido.");
      };
    });
    this._startMeter();
    this.active = true;
    this._startSegment(topicId);
  }

  _startMeter() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx = new Ctx();
      this.audioCtx.resume?.();
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      source.connect(this.analyser);
      const buf = new Float32Array(this.analyser.fftSize);
      this.levelTimer = setInterval(() => {
        this.analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        if (this.current && rms > SPEECH_RMS) this.current.speechFrames += 1;
        this.onLevel?.(Math.min(1, rms * 8));
      }, 100);
    } catch {
      this.analyser = null; // sem medidor: todos os trechos são enviados
    }
  }

  _startSegment(topicId) {
    const options = { audioBitsPerSecond: 32000 };
    if (this.mime) options.mimeType = this.mime;
    const recorder = new MediaRecorder(this.stream, options);
    const segment = {
      recorder,
      topicId,
      parts: [],
      startedAt: Date.now(),
      speechFrames: 0,
      done: null,
    };
    segment.done = new Promise((resolve) => {
      recorder.ondataavailable = (e) => e.data && e.data.size > 0 && segment.parts.push(e.data);
      recorder.onstop = () => {
        const type = recorder.mimeType || this.mime || "audio/webm";
        const blob = new Blob(segment.parts, { type });
        const info = {
          blob,
          mime: type,
          topicId: segment.topicId,
          startedAt: segment.startedAt,
          durationMs: Date.now() - segment.startedAt,
          hadSpeech: !this.analyser || segment.speechFrames >= SPEECH_MIN_FRAMES,
        };
        resolve(info);
        if (blob.size > 0) this.onSegment?.(info);
      };
    });
    recorder.start();
    this.current = segment;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.rotate(), this.segmentMs);
  }

  // Fecha o trecho atual e começa outro (opcionalmente associado a outro item da pauta).
  rotate(nextTopicId) {
    if (!this.active || !this.current) return Promise.resolve(null);
    const previous = this.current;
    const topicId = nextTopicId ?? previous.topicId;
    if (previous.recorder.state !== "inactive") previous.recorder.stop();
    this._startSegment(topicId);
    return previous.done;
  }

  get topicId() {
    return this.current?.topicId;
  }

  async stop() {
    if (!this.active) return null;
    this.active = false;
    clearTimeout(this.timer);
    clearInterval(this.levelTimer);
    const last = this.current;
    this.current = null;
    if (last && last.recorder.state !== "inactive") last.recorder.stop();
    const info = last ? await last.done : null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioCtx?.close?.().catch(() => {});
    this.onLevel?.(0);
    return info;
  }
}
