import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  House,
  CalendarPlus,
  ListChecks,
  SignOut,
  WaveSawtooth,
  GearSix,
  Database,
} from "@phosphor-icons/react";

const navItems = [
  { to: "/", label: "Dashboard", icon: House, testid: "nav-dashboard" },
  { to: "/meetings/new", label: "Nova Reunião", icon: CalendarPlus, testid: "nav-new-meeting" },
  { to: "/deliberations", label: "Deliberações", icon: ListChecks, testid: "nav-deliberations" },
  { to: "/kb", label: "Base de Conhecimento", icon: Database, testid: "nav-kb" },
  { to: "/admin", label: "Administração", icon: GearSix, testid: "nav-admin" },
];

function Avatar({ name }) {
  const initials = (name || "?")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  return (
    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0055FF] to-[#3B82F6] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-lg">
      {initials}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-[#F0F2F5]">
      <aside
        className="w-64 flex flex-col fixed top-0 left-0 h-screen z-20"
        style={{ background: "#0B1628" }}
        data-testid="sidebar-nav"
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/8">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 group w-full"
            data-testid="sidebar-logo"
          >
            <div className="w-9 h-9 bg-[#0055FF] rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-[0_0_16px_rgba(0,85,255,0.5)] transition-shadow">
              <WaveSawtooth size={18} weight="bold" className="text-white" />
            </div>
            <div className="text-left">
              <div className="font-display font-black text-[17px] leading-none text-white tracking-tight">
                ATA<span className="text-[#0055FF]">.IA</span>
              </div>
              <div className="text-[9px] tracking-[0.22em] uppercase text-white/35 mt-1 font-medium">
                Gestão de Reuniões
              </div>
            </div>
          </button>
        </div>

        {/* Nav label */}
        <div className="px-5 pt-5 pb-2">
          <span className="text-[9px] uppercase tracking-[0.25em] font-bold text-white/25">
            Menu
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto" data-testid="sidebar-items">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                data-testid={item.testid}
                className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:bg-white/6 hover:text-white/80"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#0055FF] rounded-r-full" />
                )}
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  active ? "bg-[#0055FF]/20 text-[#5B8BFF]" : "text-white/40 group-hover:text-white/60"
                }`}>
                  <Icon size={17} weight={active ? "fill" : "regular"} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-5 border-t border-white/8 my-3" />

        {/* User section */}
        <div className="px-4 pb-5">
          <div className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-white/5 transition-colors group mb-1">
            <Avatar name={user?.name} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate leading-none mb-0.5">
                {user?.name || "Usuário"}
              </div>
              <div className="text-[11px] text-white/35 truncate">
                {user?.email}
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-white/40 hover:bg-white/6 hover:text-white/70 transition-all"
          >
            <span className="w-8 h-8 rounded-lg flex items-center justify-center">
              <SignOut size={17} />
            </span>
            Sair da conta
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 overflow-auto min-h-screen">{children}</main>
    </div>
  );
}
