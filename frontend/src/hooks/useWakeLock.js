import { useEffect } from "react";

// Mantém a tela acesa enquanto `active` for verdadeiro (celular sobre a mesa durante a reunião).
// O navegador solta o bloqueio quando a aba fica oculta; ele é pedido de novo ao voltar.
export default function useWakeLock(active) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return undefined;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible" && !cancelled) {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        /* sem suporte ou bateria baixa: segue sem bloqueio */
      }
    };
    const onVisible = () => document.visibilityState === "visible" && acquire();
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release?.().catch(() => {});
    };
  }, [active]);
}
