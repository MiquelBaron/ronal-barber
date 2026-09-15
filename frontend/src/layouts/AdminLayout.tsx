import {
  Calendar,
  CalendarDays,
  Clock,
  LayoutDashboard,
  LogOut,
  Scissors,
  Settings,
  Users,
  UserSquare2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { StaffProvider, staffHomePath, staffRoleLabel, type StaffUser } from "../contexts/StaffContext";
import { api } from "../services/api";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
  barberOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { href: "/admin/appointments", label: "Citas", icon: Calendar },
  { href: "/admin/agenda", label: "Mi agenda", icon: CalendarDays, barberOnly: true },
  { href: "/admin/services", label: "Servicios", icon: Scissors },
  { href: "/admin/barbers", label: "Barberos", icon: Users },
  { href: "/admin/hours", label: "Horarios", icon: Clock },
  { href: "/admin/days-off", label: "Días libres", icon: CalendarDays },
  { href: "/admin/users", label: "Usuarios", icon: UserSquare2, adminOnly: true },
  { href: "/admin/settings", label: "Configuración", icon: Settings, adminOnly: true },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<StaffUser | null>(null);

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

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && user.role !== "admin") return false;
    if (item.barberOnly && !isBarberStaff) return false;
    return true;
  });

  return (
    <StaffProvider user={user}>
      <div className="min-h-screen bg-[#eceae4] text-ink lg:flex">
        <aside className="border-b border-black/10 bg-ink text-paper lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
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

          <nav className="flex gap-1 overflow-x-auto px-3 py-4 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-4">
            {visibleNav.map(({ href, label, icon: Icon }) => (
              <NavLink
                key={href}
                to={href}
                end={href === "/admin"}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-3 px-4 py-3 text-xs uppercase tracking-[0.14em] transition-colors ${
                    isActive
                      ? "bg-accent text-ink"
                      : "text-paper/60 hover:bg-white/5 hover:text-paper"
                  }`
                }
              >
                <Icon size={16} className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-white/10 px-4 py-4">
            <Link
              to="/"
              className="mb-2 block px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-paper/40 transition-colors hover:text-accent"
            >
              ← Web pública
            </Link>
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs uppercase tracking-[0.14em] text-red-300 transition-colors hover:bg-white/5"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </StaffProvider>
  );
}
