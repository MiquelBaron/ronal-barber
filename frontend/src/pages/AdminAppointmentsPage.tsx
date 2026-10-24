import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ManualAppointmentForm } from "../components/ManualAppointmentForm";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { AdminAppointment, Barber } from "../types/api";
import { appointmentStatusLabel } from "../utils/status";

type AppointmentsView = "today_upcoming" | "all";

export function AdminAppointmentsPage() {
  const { isAdmin, isBarberStaff } = useStaff();
  const [items, setItems] = useState<AdminAppointment[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<AppointmentsView>("today_upcoming");

  const load = useCallback(() => {
    api
      .getAdminAppointments(view)
      .then(setItems)
      .catch(() => setError("No se han podido cargar las citas."));
  }, [view]);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    api.getBarbers().then(setBarbers).catch(() => undefined);
  }, [load, isAdmin]);

  if (isBarberStaff) {
    return <Navigate to="/admin/agenda" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  async function cancelAppointment(id: number) {
    if (!window.confirm("¿Cancelar esta cita? Se avisará al cliente por email y al barbero por Telegram.")) {
      return;
    }
    setCancellingId(id);
    setError("");
    try {
      const updated = await api.cancelAdminAppointment(id);
      setItems((current) => current.map((item) => (item.id === updated.id ? { ...item, status: updated.status } : item)));
    } catch {
      setError("No se ha podido cancelar la cita.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <section>
      <StaffPageHeader
        eyebrow="Operativa"
        title={view === "today_upcoming" ? "Próximas citas de hoy" : "Todas las citas"}
        description={
          view === "today_upcoming"
            ? "Citas de hoy con hora de inicio posterior a ahora."
            : "Consulta y gestiona todas las reservas del local."
        }
      />

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView("today_upcoming")}
            className={`px-4 py-2.5 text-xs uppercase tracking-[0.14em] ${
              view === "today_upcoming" ? "bg-ink text-paper" : "border border-black/15 bg-white"
            }`}
          >
            Hoy (próximas)
          </button>
          <button
            type="button"
            onClick={() => setView("all")}
            className={`px-4 py-2.5 text-xs uppercase tracking-[0.14em] ${
              view === "all" ? "bg-ink text-paper" : "border border-black/15 bg-white"
            }`}
          >
            Ver todas
          </button>
          <button
            type="button"
            onClick={load}
            className="border border-black/15 bg-white px-4 py-2.5 text-xs uppercase tracking-[0.14em] hover:border-accent"
          >
            Actualizar
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="rounded-sm border border-black/15 bg-white px-5 py-3 text-xs uppercase tracking-[0.14em] shadow-sm hover:border-accent"
        >
          {showForm ? "Ocultar formulario" : "Crear cita"}
        </button>
      </div>

      {showForm && (
        <div className="mb-10 max-w-xl rounded-sm border border-black/10 bg-white p-6 shadow-sm">
          <ManualAppointmentForm
            barbers={barbers}
            defaultBarberId={undefined}
            isBarber={false}
            onCreated={() => {
              load();
              setShowForm(false);
            }}
          />
        </div>
      )}

      {error && <p className="mb-6 text-sm text-red-700">{error}</p>}

      {items.length === 0 ? (
        <p className="rounded-sm border border-black/10 bg-white px-6 py-10 text-sm text-black/50 shadow-sm">
          {view === "today_upcoming"
            ? "No quedan citas próximas para hoy."
            : "No hay citas registradas."}
        </p>
      ) : (
        <div className="divide-y divide-black/10 rounded-sm border border-black/10 bg-white shadow-sm">
          {items.map((item) => (
            <article key={item.id} className="grid gap-4 px-6 py-5 md:grid-cols-[150px_1fr_1fr_auto] md:items-center">
              <time className="text-sm font-medium">
                {item.date} · {item.start_time.slice(0, 5)}
              </time>
              <div>
                <p>
                  {item.customer_name} {item.customer_surname}
                </p>
                <p className="text-sm text-black/55">{item.customer_email}</p>
              </div>
              <div>
                <p>{item.service_name}</p>
                <p className="text-sm text-black/70">{item.barber_name ?? "Sin barbero"}</p>
                <p className="text-sm text-black/55">
                  {item.price} € · {appointmentStatusLabel(item.status)}
                </p>
              </div>
              {item.status === "cancelled" ? (
                <span className="justify-self-start rounded-sm border border-black/10 bg-black/5 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-black/45">
                  Cancelada
                </span>
              ) : (
                <button
                  type="button"
                  disabled={cancellingId === item.id}
                  onClick={() => cancelAppointment(item.id)}
                  className="justify-self-start border border-red-700/30 px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-red-800 hover:border-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  {cancellingId === item.id ? "Cancelando…" : "Cancelar"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
