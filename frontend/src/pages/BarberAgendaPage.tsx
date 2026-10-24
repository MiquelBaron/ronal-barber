import { useCallback, useEffect, useMemo, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { CalendarPlus, CalendarRange } from "lucide-react";
import { ManualAppointmentForm } from "../components/ManualAppointmentForm";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { Appointment, Barber } from "../types/api";
import { appointmentStatusLabel } from "../utils/status";

type Tab = "agenda" | "nueva";

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

  const activeAppointments = appointments.filter((appointment) => appointment.status !== "cancelled");
  const dateAppointments = activeAppointments.filter((appointment) => appointment.date === selectedDateIso);
  const appointmentDates = new Set(activeAppointments.map((appointment) => appointment.date));

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: "agenda", label: "Calendario", icon: CalendarRange },
    { id: "nueva", label: "Nueva cita", icon: CalendarPlus },
  ];

  return (
    <section>
      <StaffPageHeader
        eyebrow="Barbero"
        title={`Hola, ${user.barber_name ?? "barbero"}`}
        description="Tu agenda personal y citas manuales."
      />

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
        <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:gap-6">
          <div className="rounded-sm border border-black/10 bg-white/70 p-3 shadow-sm sm:p-4">
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
          <div className="rounded-sm border border-black/10 bg-white/70 p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-black/45">
                  {selectedDate.toLocaleDateString("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
                <h2 className="mt-1 font-display text-2xl uppercase sm:text-3xl">Citas del día</h2>
              </div>
              {!addingForSelectedDay && (
                <button
                  type="button"
                  onClick={() => setAddingForSelectedDay(true)}
                  className="inline-flex items-center gap-1.5 border border-black/15 bg-white px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] hover:border-accent"
                >
                  <CalendarPlus size={12} />
                  Añadir
                </button>
              )}
            </div>
            {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

            {addingForSelectedDay && (
              <div className="mt-4 border-b border-black/10 pb-4">
                <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-black/45">
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

            {dateAppointments.length === 0 && !addingForSelectedDay ? (
              <p className="mt-5 text-sm text-black/50">No hay citas para este día.</p>
            ) : dateAppointments.length === 0 ? (
              <p className="mt-4 text-sm text-black/50">Aún no hay citas para este día.</p>
            ) : (
              <div className="mt-3 divide-y divide-black/10">
                {dateAppointments.map((appointment) => (
                  <article
                    key={appointment.id}
                    className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-x-2.5 gap-y-0.5 py-2"
                  >
                    <time className="font-display text-lg leading-none tabular-nums sm:text-xl">
                      {appointment.start_time.slice(0, 5)}
                    </time>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-tight">
                        {appointment.customer_name} {appointment.customer_surname}
                      </p>
                      <p className="truncate text-[11px] leading-tight text-black/50">
                        {appointment.service_name}
                        <span className="hidden sm:inline"> · {appointment.customer_phone}</span>
                      </p>
                      <a
                        href={`tel:${appointment.customer_phone}`}
                        className="mt-0.5 block truncate text-[11px] leading-tight text-black/45 sm:hidden"
                      >
                        {appointment.customer_phone}
                      </a>
                    </div>
                    {appointment.status === "cancelled" ? (
                      <span className="text-[9px] uppercase tracking-[0.1em] text-black/40">
                        {appointmentStatusLabel(appointment.status)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={cancellingId === appointment.id}
                        onClick={() => cancelAppointment(appointment.id)}
                        className="shrink-0 px-1 py-0.5 text-[9px] uppercase tracking-[0.08em] text-red-800/80 hover:text-red-900 disabled:opacity-40"
                      >
                        {cancellingId === appointment.id ? "…" : "Cancelar"}
                      </button>
                    )}
                  </article>
                ))}
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
    </section>
  );
}
