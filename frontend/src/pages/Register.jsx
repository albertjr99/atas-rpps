import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { WaveSawtooth, ArrowRight, CheckCircle } from "@phosphor-icons/react";

const benefits = [
  "Geração automática de atas via IA",
  "Transcrição de áudio em tempo real",
  "Rastreamento de deliberações",
  "Exportação em PDF e DOCX",
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", institution: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      toast.success("Conta criada com sucesso!");
      navigate("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao cadastrar");
    } finally {
      setLoading(false);
    }
  };

  const change = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* ── Left panel ── */}
      <div className="hidden lg:flex relative bg-[#0B1628] overflow-hidden flex-col">
        <div className="absolute inset-0 dot-grid" />
        <div className="absolute bottom-1/4 -left-20 w-80 h-80 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #0055FF, transparent)" }} />
        <div className="absolute top-1/3 right-0 w-64 h-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #3B82F6, transparent)" }} />

        <div className="relative z-10 flex flex-col h-full p-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0055FF] rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <WaveSawtooth size={20} weight="bold" className="text-white" />
            </div>
            <span className="font-display font-black text-xl text-white">
              ATA<span className="text-[#0055FF]">.IA</span>
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <div className="label-eyebrow text-white/30 mb-5">
              Comece em 1 minuto
            </div>
            <h1 className="font-display font-black text-[3rem] leading-[0.95] tracking-tight text-white mb-6">
              Reuniões mais<br />eficientes com<br />
              <span className="gradient-text">inteligência.</span>
            </h1>
            <p className="text-white/50 text-sm max-w-sm leading-relaxed mb-10">
              Junte-se a gestores de RPPS que já modernizaram
              seus processos com ATA.IA.
            </p>

            <div className="space-y-3">
              {benefits.map((b) => (
                <div key={b} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#0055FF]/20 border border-[#0055FF]/40 flex items-center justify-center flex-shrink-0">
                    <CheckCircle size={12} weight="fill" className="text-[#5B8BFF]" />
                  </div>
                  <span className="text-sm text-white/60">{b}</span>
                </div>
              ))}
            </div>
          </div>

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
          data-testid="register-form"
        >
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-8 h-8 bg-[#0055FF] rounded-lg flex items-center justify-center">
              <WaveSawtooth size={16} weight="bold" className="text-white" />
            </div>
            <span className="font-display font-black text-lg">ATA<span className="text-[#0055FF]">.IA</span></span>
          </div>

          <div className="label-eyebrow mb-3 text-slate-400">Cadastro</div>
          <h2 className="font-display text-3xl font-bold mb-1 text-slate-900">
            Crie sua conta
          </h2>
          <p className="text-slate-500 text-sm mb-8">
            Rápido, seguro e gratuito para começar
          </p>

          <div className="space-y-4">
            <div className="fade-up-delay-1">
              <Label htmlFor="name" className="text-xs font-semibold text-slate-600">
                Nome completo
              </Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={change("name")}
                className="mt-1.5 h-11 rounded-xl border-slate-200"
                data-testid="register-name-input"
              />
            </div>

            <div className="fade-up-delay-2">
              <Label htmlFor="institution" className="text-xs font-semibold text-slate-600">
                Instituição / RPPS
              </Label>
              <Input
                id="institution"
                value={form.institution}
                onChange={change("institution")}
                placeholder="Ex.: RPPS do Município de …"
                className="mt-1.5 h-11 rounded-xl border-slate-200"
                data-testid="register-institution-input"
              />
            </div>

            <div className="fade-up-delay-3">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-600">
                E-mail institucional
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={change("email")}
                className="mt-1.5 h-11 rounded-xl border-slate-200"
                data-testid="register-email-input"
              />
            </div>

            <div className="fade-up-delay-4">
              <Label htmlFor="password" className="text-xs font-semibold text-slate-600">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={change("password")}
                className="mt-1.5 h-11 rounded-xl border-slate-200"
                data-testid="register-password-input"
              />
            </div>

            <div className="fade-up-delay-5">
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-[#0055FF] hover:bg-[#0044CC] rounded-xl shadow-lg shadow-blue-500/25 transition-all font-semibold"
                data-testid="register-submit-btn"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Criando conta…
                  </span>
                ) : (
                  <>Criar conta <ArrowRight size={16} weight="bold" /></>
                )}
              </Button>
            </div>
          </div>

          <div className="mt-8 text-sm text-slate-500 text-center">
            Já tem conta?{" "}
            <Link
              to="/login"
              className="text-[#0055FF] font-semibold hover:underline"
              data-testid="login-link"
            >
              Entrar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
