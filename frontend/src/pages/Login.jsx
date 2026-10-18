import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { WaveSawtooth, ArrowRight, ShieldCheck, Brain, FileText } from "@phosphor-icons/react";

const features = [
  { icon: Brain, label: "IA Generativa", desc: "Transcrição e geração automática" },
  { icon: FileText, label: "Ata Instantânea", desc: "Do áudio ao documento oficial" },
  { icon: ShieldCheck, label: "Padrão RPPS", desc: "Conforme normas vigentes" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [allowSignup, setAllowSignup] = useState(false);

  useEffect(() => {
    api.get("/auth/config").then((r) => setAllowSignup(!!r.data.allow_signup)).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Bem-vindo!");
      navigate("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* ── Left panel ── */}
      <div className="hidden lg:flex relative bg-[#0B1628] overflow-hidden flex-col">
        {/* Dot grid background */}
        <div className="absolute inset-0 dot-grid" />

        {/* Gradient orbs */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #0055FF, transparent)" }} />
        <div className="absolute bottom-1/3 right-0 w-64 h-64 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #3B82F6, transparent)" }} />

        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0055FF] rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <WaveSawtooth size={20} weight="bold" className="text-white" />
            </div>
            <span className="font-display font-black text-xl text-white">
              ATA<span className="text-[#0055FF]">.IA</span>
            </span>
          </div>

          {/* Hero text */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="label-eyebrow text-white/30 mb-5">
              Sistema Inteligente para RPPS
            </div>
            <h1 className="font-display font-black text-[3.2rem] leading-[0.95] tracking-tight text-white mb-6">
              Da reunião<br />
              à ata pronta.<br />
              <span className="gradient-text">Em minutos.</span>
            </h1>
            <p className="text-white/50 text-base max-w-md leading-relaxed">
              Grave, transcreva, delibere e gere atas oficiais com inteligência
              artificial. Tudo em um único fluxo contínuo.
            </p>

            {/* Feature chips */}
            <div className="mt-10 space-y-3">
              {features.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={18} weight="bold" className="text-[#5B8BFF]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white/90">{label}</div>
                    <div className="text-xs text-white/40">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-xs text-white/20 font-medium">
            © 2025 ATA.IA · Todos os direitos reservados
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex items-center justify-center p-8 bg-white">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm fade-up"
          data-testid="login-form"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-8 h-8 bg-[#0055FF] rounded-lg flex items-center justify-center">
              <WaveSawtooth size={16} weight="bold" className="text-white" />
            </div>
            <span className="font-display font-black text-lg">ATA<span className="text-[#0055FF]">.IA</span></span>
          </div>

          <div className="label-eyebrow mb-3 text-slate-400">Acesso seguro</div>
          <h2 className="font-display text-3xl font-bold mb-1 text-slate-900">
            Bem-vindo de volta
          </h2>
          <p className="text-slate-500 text-sm mb-8">
            Acesse sua conta para continuar
          </p>

          <div className="space-y-5">
            <div className="fade-up-delay-1">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-600">
                E-mail institucional
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@instituicao.gov.br"
                className="mt-1.5 h-11 rounded-xl border-slate-200 focus:border-[#0055FF] focus:ring-[#0055FF]/20"
                data-testid="login-email-input"
              />
            </div>

            <div className="fade-up-delay-2">
              <Label htmlFor="password" className="text-xs font-semibold text-slate-600">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 h-11 rounded-xl border-slate-200 focus:border-[#0055FF] focus:ring-[#0055FF]/20"
                data-testid="login-password-input"
              />
            </div>

            <div className="fade-up-delay-3">
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-[#0055FF] hover:bg-[#0044CC] rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/35 transition-all font-semibold"
                data-testid="login-submit-btn"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Entrando…
                  </span>
                ) : (
                  <>Entrar <ArrowRight size={16} weight="bold" /></>
                )}
              </Button>
            </div>
          </div>

          {allowSignup && (
          <div className="mt-8 text-sm text-slate-500 text-center">
            Ainda não tem conta?{" "}
            <Link
              to="/register"
              className="text-[#0055FF] font-semibold hover:underline"
              data-testid="register-link"
            >
              Cadastrar meu RPPS
            </Link>
          </div>
          )}
        </form>
      </div>
    </div>
  );
}
