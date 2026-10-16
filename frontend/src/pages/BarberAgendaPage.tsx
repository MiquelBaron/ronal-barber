import { useCallback, useEffect, useMemo, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { Bell, CalendarPlus, CalendarRange } from "lucide-react";
import { Link } from "react-router-dom";
import { ManualAppointmentForm } from "../components/ManualAppointmentForm";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { TelegramLink } from "../components/TelegramLink";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { Appointment, Barber } from "../types/api";
import { upcomingTodayAppointments } from "../utils/appointments";
import { appointmentStatusLabel } from "../utils/status";

type Tab = "agenda" | "nueva" | "telegram";

export function BarberAgendaPage() {
  const { user } = useStaff();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("agenda");
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [addingForSelectedDay, setAddingForSelectedDay] = useState(false);

  const loadAppointments = useCallback(() => {
    api.getMyAppointments().then(setAppointments).catch(() => setError("No se han podido cargar tus citas."));
  }, []);

  useEffect(() => {
    Promise.all([api.getMyAppointments(), api.getBarbers()])
      .then(([appointmentsData, barbersData]) => {
        setAppointments(appointmentsData);
        setBarbers(barbersData);
      })
      .catch(() => setError("No se han podido cargar tus citas."));
  }, []);

  async function cancelAppointment(id: number) {
    if (!window.confirm("¿Cancelar esta cita? Se avisará al cliente por email y al barbero por Telegram.")) {
      return;
    }
    setCancellingId(id);
    setError("");
    try {
      const updated = await api.cancelAdminAppointment(id);
      setAppointments((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, status: updated.status } : item)),
      );
    } catch {
      setError("No se ha podido cancelar la cita.");
    } finally {
      setCancellingId(null);
    }
  }

  const selectedDateIso = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [selectedDate]);

  const dateAppointments = appointments.filter((appointment) => appointment.date === selectedDateIso);
  const appointmentDates = new Set(appointments.map((appointment) => appointment.date));
  const upcomingToday = useMemo(() => upcomingTodayAppointments(appointments), [appointments]);

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: "agenda", label: "Calendario", icon: CalendarRange },
    { id: "nueva", label: "Nueva cita", icon: CalendarPlus },
    { id: "telegram", label: "Telegram", icon: Bell },
  ];

  return (
    <section>
      <StaffPageHeader
        eyebrow="Barbero"
        title={`Hola, ${user.barber_name ?? "barbero"}`}
        description="Tu agenda personal, citas manuales y notificaciones Telegram."
      />

      <div className="mb-8 rounded-sm border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-black/45">Hoy</p>
            <h2 className="mt-2 font-display text-3xl uppercase">Próximas citas</h2>
          </div>
          <Link to="/admin/appointments" className="text-xs uppercase tracking-[0.14em] text-black/50 hover:text-accent">
            Ver en Citas →
          </Link>
        </div>
        {upcomingToday.length === 0 ? (
          <p className="mt-6 text-sm text-black/50">No quedan citas próximas para hoy.</p>
        ) : (
          <div className="mt-6 divide-y divide-black/10">
            {upcomingToday.map((appointment) => (
              <article key={appointment.id} className="grid gap-2 py-4 sm:grid-cols-[80px_1fr_auto] sm:items-center">
                <time className="font-display text-2xl">{appointment.start_time.slice(0, 5)}</time>
                <div>
                  <p className="font-medium">{appointment.service_name}</p>
                  <p className="text-sm text-black/55">
                    {appointment.customer_name} {appointment.customer_surname}
                  </p>
                </div>
                {appointment.status === "cancelled" ? (
                  <span className="text-[10px] uppercase tracking-[0.12em] text-black/40">Cancelada</span>
                ) : (
                  <button
                    type="button"
                    disabled={cancellingId === appointment.id}
                    onClick={() => cancelAppointment(appointment.id)}
                    className="border border-red-700/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-red-800 hover:bg-red-50 disabled:opacity-40"
                  >
                    {cancellingId === appointment.id ? "…" : "Cancelar"}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.14em] transition-colors ${
              tab === id ? "bg-ink text-paper" : "border border-black/15 bg-white/50 hover:border-black/30"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === "agenda" && (
        <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
          <div className="rounded-sm border border-black/10 bg-white/70 p-5 shadow-sm">
            <Calendar
              onChange={(value) => {
                const date = Array.isArray(value) ? value[0] : value;
                if (date instanceof Date) {
                  setSelectedDate(date);
                  setAddingForSelectedDay(false);
                }
              }}
              value={selectedDate}
              tileClassName={({ date }) =>
                appointmentDates.has(
                  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
                )
                  ? "has-appointment"
                  : undefined
              }
            />
          </div>
          <div className="rounded-sm border border-black/10 bg-white/70 p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-black/45">
                  {selectedDate.toLocaleDateString("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <h2 className="mt-3 font-display text-3xl uppercase">Citas del día</h2>
              </div>
              {!addingForSelectedDay && (
                <button
                  type="button"
                  onClick={() => setAddingForSelectedDay(true)}
                  className="inline-flex items-center gap-2 border border-black/15 bg-white px-4 py-2.5 text-xs uppercase tracking-[0.14em] hover:border-accent"
                >
                  <CalendarPlus size={14} />
                  Añadir cita este día
                </button>
              )}
            </div>
            {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
            {dateAppointments.length === 0 && !addingForSelectedDay ? (
              <p className="mt-8 text-sm text-black/50">No hay citas para este día.</p>
            ) : (
              <div className="mt-6 divide-y divide-black/10">
                {dateAppointments.map((appointment) => (
                  <article key={appointment.id} className="grid gap-3 py-5 sm:grid-cols-[100px_1fr_auto]">
                    <time className="font-display text-2xl">{appointment.start_time.slice(0, 5)}</time>
                    <div>
                      <h3 className="font-medium">{appointment.service_name}</h3>
                      <p className="mt-1 text-sm text-black/55">
                        {appointment.customer_name} {appointment.customer_surname}
                      </p>
                      <p className="text-sm text-black/45">
                        {appointment.customer_phone} · {appointment.customer_email}
                      </p>
                    </div>
                    {appointment.status === "cancelled" ? (
                      <span className="self-start rounded-sm bg-black/5 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-black/45">
                        {appointmentStatusLabel(appointment.status)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={cancellingId === appointment.id}
                        onClick={() => cancelAppointment(appointment.id)}
                        className="self-start border border-red-700/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-red-800 hover:bg-red-50 disabled:opacity-40"
                      >
                        {cancellingId === appointment.id ? "…" : "Cancelar"}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}

            {addingForSelectedDay && (
              <div className="mt-8 border-t border-black/10 pt-6">
                <p className="mb-4 text-[10px] uppercase tracking-[0.18em] text-black/45">
                  Nueva cita · {selectedDateIso}
                </p>
                <ManualAppointmentForm
                  key={`day-${selectedDateIso}-${user.barber_id ?? "x"}`}
                  barbers={barbers}
                  defaultBarberId={user.barber_id ?? undefined}
                  defaultDate={selectedDateIso}
                  isBarber
                  onCancel={() => setAddingForSelectedDay(false)}
                  onCreated={() => {
                    loadAppointments();
                    setAddingForSelectedDay(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "nueva" && (
        <div className="max-w-xl rounded-sm border border-black/10 bg-white/70 p-8 shadow-sm">
          <ManualAppointmentForm
            barbers={barbers}
            defaultBarberId={user.barber_id ?? undefined}
            isBarber
            onCreated={loadAppointments}
          />
        </div>
      )}

      {tab === "telegram" && (
        <div className="max-w-xl">
          <TelegramLink />
        </div>
      )}
    </section>
  );
}
