import { useCallback, useEffect, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { Bell, CalendarPlus, CalendarRange } from "lucide-react";
import { ManualAppointmentForm } from "../components/ManualAppointmentForm";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { TelegramLink } from "../components/TelegramLink";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { Appointment, Barber } from "../types/api";

type Tab = "agenda" | "nueva" | "telegram";

export function BarberAgendaPage() {
  const { user } = useStaff();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("agenda");
  const [barbers, setBarbers] = useState<Barber[]>([]);

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

  const dateAppointments = appointments.filter(
    (appointment) => appointment.date === selectedDate.toISOString().slice(0, 10),
  );
  const appointmentDates = new Set(appointments.map((appointment) => appointment.date));

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

      <div className="mb-8 flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
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
                if (date instanceof Date) setSelectedDate(date);
              }}
              value={selectedDate}
              tileClassName={({ date }) =>
                appointmentDates.has(date.toISOString().slice(0, 10)) ? "has-appointment" : undefined
              }
            />
          </div>
          <div className="rounded-sm border border-black/10 bg-white/70 p-6 shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-black/45">
              {selectedDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <h2 className="mt-3 font-display text-3xl uppercase">Citas del día</h2>
            {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
            {dateAppointments.length === 0 ? (
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
                    <span className="self-start rounded-sm bg-black/5 px-3 py-1 text-[10px] uppercase tracking-[0.12em]">
                      {appointment.status}
                    </span>
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

      {tab === "telegram" && (
        <div className="max-w-xl">
          <TelegramLink />
        </div>
      )}
    </section>
  );
}
