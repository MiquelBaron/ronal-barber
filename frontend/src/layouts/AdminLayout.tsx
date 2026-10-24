import {
  Activity,
  Calendar,
  CalendarDays,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  Scissors,
  Settings,
  Timer,
  Users,
  UserSquare2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { StaffProvider, staffHomePath, staffRoleLabel, type StaffUser } from "../contexts/StaffContext";
import { api } from "../services/api";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
  barberOnly?: boolean;
  /** Visible for admin + admin_barber (not limited barber). */
  managerOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { href: "/admin/agenda", label: "Mi agenda", icon: CalendarDays, barberOnly: true },
  { href: "/admin/appointments", label: "Citas", icon: Calendar, adminOnly: true },
  { href: "/admin/services", label: "Servicios", icon: Scissors, managerOnly: true },
  { href: "/admin/barbers", label: "Barberos", icon: Users, managerOnly: true },
  { href: "/admin/hours", label: "Horarios", icon: Clock },
  { href: "/admin/days-off", label: "Días libres", icon: CalendarDays },
  { href: "/admin/users", label: "Usuarios", icon: UserSquare2, adminOnly: true },
  { href: "/admin/crons", label: "Crons", icon: Timer, adminOnly: true },
  { href: "/admin/profiling", label: "Profiling", icon: Activity, adminOnly: true },
  { href: "/admin/profile", label: "Configuración", icon: Settings, barberOnly: true },
  { href: "/admin/settings", label: "Ajustes", icon: Settings, adminOnly: true },
];

function NavLinks({
  items,
  onNavigate,
  className,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav className={className}>
      {items.map(({ href, label, icon: Icon }) => (
        <NavLink
          key={href}
          to={href}
          end={href === "/admin"}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-[0.14em] transition-colors ${
              isActive ? "bg-accent text-ink" : "text-paper/60 hover:bg-white/5 hover:text-paper"
            }`
          }
        >
          <Icon size={16} className="shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((current) => {
        if (!["admin", "barber", "admin_barber"].includes(current.role)) {
          navigate("/admin/login");
          return;
        }
        setUser(current);
      })
      .catch(() => navigate("/admin/login"));
  }, [navigate]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  async function logout() {
    await api.logout();
    navigate("/admin/login");
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eceae4]">
        <div className="h-8 w-8 animate-pulse rounded-full border-2 border-accent border-t-transparent" />
      </main>
    );
  }

  const isBarberStaff = user.role === "barber" || user.role === "admin_barber";
  const isManager = user.role === "admin" || user.role === "admin_barber";

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && user.role !== "admin") return false;
    if (item.barberOnly && !isBarberStaff) return false;
    if (item.managerOnly && !isManager) return false;
    return true;
  });

  return (
    <StaffProvider user={user} setUser={setUser}>
      <div className="min-h-screen bg-[#eceae4] text-ink lg:flex">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/10 bg-ink px-4 py-3 text-paper lg:hidden">
          <Link to={staffHomePath(user.role)} className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.28em] text-accent">Ronal Barber</p>
            <p className="truncate font-display text-xl uppercase leading-none">Panel</p>
          </Link>
          <button
            type="button"
            className="rounded-sm p-2 text-paper/80 hover:bg-white/5"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Cerrar menú"
              onClick={() => setMenuOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-ink text-paper shadow-xl">
              <div className="border-b border-white/10 px-6 py-6">
                <p className="text-[10px] uppercase tracking-[0.32em] text-accent">Ronal Barber</p>
                <p className="mt-2 font-display text-3xl uppercase leading-none">Panel</p>
                <div className="mt-5 rounded-sm border border-white/10 bg-white/5 px-4 py-3">
                  <p className="truncate text-sm text-paper/90">{user.barber_name ?? user.email}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-paper/45">
                    {staffRoleLabel(user.role)}
                  </p>
                </div>
              </div>
              <NavLinks
                items={visibleNav}
                onNavigate={() => setMenuOpen(false)}
                className="flex max-h-[calc(100dvh-14rem)] flex-col gap-1 overflow-y-auto px-4 py-4"
              />
              <div className="mt-auto border-t border-white/10 px-4 py-4">
                <Link
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className="mb-2 block px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-paper/40 hover:text-accent"
                >
                  ← Web pública
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs uppercase tracking-[0.14em] text-red-300 hover:bg-white/5"
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Desktop sidebar */}
        <aside className="hidden border-b border-black/10 bg-ink text-paper lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="border-b border-white/10 px-6 py-7">
            <Link to={staffHomePath(user.role)} className="block">
              <p className="text-[10px] uppercase tracking-[0.32em] text-accent">Ronal Barber</p>
              <p className="mt-2 font-display text-3xl uppercase leading-none">Panel</p>
            </Link>
            <div className="mt-5 rounded-sm border border-white/10 bg-white/5 px-4 py-3">
              <p className="truncate text-sm text-paper/90">{user.barber_name ?? user.email}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-paper/45">
                {staffRoleLabel(user.role)}
              </p>
            </div>
          </div>

          <NavLinks items={visibleNav} className="flex flex-1 flex-col gap-1 px-4 py-4" />

          <div className="border-t border-white/10 px-4 py-4">
            <Link
              to="/"
              className="mb-2 block px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-paper/40 transition-colors hover:text-accent"
            >
              ← Web pública
            </Link>
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs uppercase tracking-[0.14em] text-red-300 transition-colors hover:bg-white/5"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </StaffProvider>
  );
}
