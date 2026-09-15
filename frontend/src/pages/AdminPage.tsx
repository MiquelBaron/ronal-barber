import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { staffRoleLabel, useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";

type User = {
  id: number;
  email: string;
  role: string;
};

export function AdminLoginPage() {
  const navigate = useNavigate();

  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    try {
      const user = await api.login(
        String(form.get("email")),
        String(form.get("password")),
      );

      navigate(user.role === "admin" ? "/admin" : "/admin/appointments");
    } catch {
      setError("Credenciales no válidas.");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-6 py-12 text-paper">
      <div className="pointer-events-none absolute -right-40 -top-40 h-96 w-96 rounded-full border border-accent/10" />
      <div className="pointer-events-none absolute -bottom-60 -left-40 h-[32rem] w-[32rem] rounded-full border border-accent/10" />

      <div className="relative w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-accent transition-opacity hover:opacity-70"
        >
          <span className="h-px w-8 bg-accent" />
          Ronal Barber
        </Link>

        <div className="mt-12">
          <p className="text-xs uppercase tracking-[0.25em] text-paper/40">
            Área privada
          </p>

          <h1 className="mt-3 font-display text-7xl uppercase leading-none tracking-tight sm:text-8xl">
            Acceso.
          </h1>

          <p className="mt-6 max-w-sm text-sm leading-6 text-paper/55">
            Introduce tus credenciales para acceder al panel de gestión.
          </p>
        </div>

        <form onSubmit={submit} className="mt-12 space-y-7">
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-paper/40">
              Email
            </span>

            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              placeholder="tu@email.com"
              className="w-full border-b border-paper/20 bg-transparent px-0 py-4 text-sm text-paper outline-none transition-colors placeholder:text-paper/25 focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-paper/40">
              Contraseña
            </span>

            <input
              required
              minLength={4}
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full border-b border-paper/20 bg-transparent px-0 py-4 text-sm text-paper outline-none transition-colors placeholder:text-paper/25 focus:border-accent"
            />
          </label>

          {error && (
            <div className="border border-red-400/20 bg-red-400/5 px-4 py-3 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="group flex w-full items-center justify-between bg-accent px-6 py-4 text-xs uppercase tracking-[0.2em] text-ink transition-all hover:bg-paper"
          >
            <span>Entrar</span>

            <span className="transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </button>
        </form>

        <Link
          to="/"
          className="mt-10 inline-block text-[10px] uppercase tracking-[0.2em] text-paper/35 transition-colors hover:text-accent"
        >
          ← Volver a la web
        </Link>
      </div>
    </main>
  );
}

function AdminDashboard() {
  const { isAdmin } = useStaff();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .getUsers()
      .then(setUsers)
      .catch(() => navigate("/admin/login"));
  }, [isAdmin, navigate]);

  if (!isAdmin) return <Navigate to="/admin/appointments" replace />;

  const cards = [
    { to: "/admin/appointments", label: "Citas", hint: "Agenda completa" },
    { to: "/admin/services", label: "Servicios", hint: "Catálogo" },
    { to: "/admin/settings", label: "Configuración", hint: "SMTP, Telegram" },
  ];

  return (
    <section>
      <StaffPageHeader
        eyebrow="Administración"
        title="Panel de control"
        description="Gestiona usuarios, servicios, barberos, horarios y reservas desde un único espacio."
      />

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-sm border border-black/10 bg-white p-7 shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-black/40">Usuarios</p>
            <strong className="mt-5 block font-display text-6xl font-medium leading-none">{users.length}</strong>
            <p className="mt-4 text-xs text-black/40">Usuarios registrados</p>
          </div>

          {cards.map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="group rounded-sm border border-black/10 bg-white p-7 shadow-sm transition-all hover:border-accent hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <p className="text-[10px] uppercase tracking-[0.2em] text-black/40">{card.hint}</p>
                <span className="text-black/30 transition-transform group-hover:translate-x-1 group-hover:text-accent">→</span>
              </div>
              <strong className="mt-5 block font-display text-4xl font-medium uppercase leading-none">{card.label}</strong>
            </Link>
          ))}
        </section>
    </section>
  );
}

export function AdminPage() {
  const location = useLocation();
  if (location.pathname === "/admin/users") {
    return <AdminUsersSection />;
  }
  return <AdminDashboard />;
}

function AdminUsersSection() {
  const { isAdmin } = useStaff();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    api.getUsers().then(setUsers).catch(() => navigate("/admin/login"));
  }, [isAdmin, navigate]);

  if (!isAdmin) return <Navigate to="/admin/appointments" replace />;

  async function remove(id: number) {
    try {
      await api.deleteUser(id);
      setUsers(users.filter((user) => user.id !== id));
    } catch {
      setError("No se puede eliminar este usuario.");
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const user = await api.createUser({
        email: String(form.get("email")),
        password: String(form.get("password")),
        role: String(form.get("role")),
      });
      setUsers([...users, user]);
      event.currentTarget.reset();
      setError("");
    } catch {
      setError("No se puede crear el usuario. Comprueba los datos.");
    }
  }

  return (
    <section>
      <StaffPageHeader eyebrow="Administración" title="Usuarios" description="Gestiona accesos de admin y barberos." />
      {error && <div className="mb-6 border border-red-700/15 bg-red-700/5 px-4 py-3 text-xs text-red-700">{error}</div>}
      <form onSubmit={add} className="mb-8 grid gap-5 rounded-sm border border-black/10 bg-white p-6 shadow-sm lg:grid-cols-[1.4fr_1fr_180px_auto]">
        <input required type="email" name="email" placeholder="usuario@email.com" className="border-b border-black/20 bg-transparent py-3 text-sm" />
        <input required minLength={4} type="password" name="password" placeholder="Contraseña" className="border-b border-black/20 bg-transparent py-3 text-sm" />
        <select name="role" className="border-b border-black/20 bg-transparent py-3 text-sm">
          <option value="admin">Admin</option>
          <option value="admin_barber">Barbero jefe</option>
          <option value="barber">Barbero</option>
        </select>
        <button type="submit" className="self-end bg-ink px-6 py-3 text-[10px] uppercase tracking-[0.18em] text-paper">Crear</button>
      </form>
      <div className="divide-y divide-black/10 rounded-sm border border-black/10 bg-white shadow-sm">
        {users.map((user) => (
          <div key={user.id} className="flex items-center justify-between px-6 py-5">
            <div>
              <p className="text-sm">{user.email}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-black/40">{staffRoleLabel(user.role)}</p>
            </div>
            <button onClick={() => remove(user.id)} className="text-[10px] uppercase tracking-[0.15em] text-red-700">Eliminar</button>
          </div>
        ))}
      </div>
    </section>
  );
}