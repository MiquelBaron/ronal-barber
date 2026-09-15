import { useCallback, useEffect, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { Link, useNavigate } from "react-router-dom";
import { ManualAppointmentForm } from "../components/ManualAppointmentForm";
import { TelegramLink } from "../components/TelegramLink";
import { api } from "../services/api";
import type { Appointment, Barber } from "../types/api";

type CalendarValue = Date | null;
type Tab = "agenda" | "nueva" | "telegram";

export function MyAppointmentsPage() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("agenda");
  const [user, setUser] = useState<{ id: number; email: string; role: string; barber_name: string; barber_id?: number | null } | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);

  const loadAppointments = useCallback(() => {
    api.getMyAppointments().then(setAppointments).catch(() => setError("No se han podido cargar tus citas."));
  }, []);

  useEffect(() => {
    Promise.all([api.getMyAppointments(), api.me(), api.getBarbers()])
      .then(([appointmentsData, userData, barbersData]) => {
        setAppointments(appointmentsData);
        setUser(userData);
        setBarbers(barbersData);
      })
      .catch(() => {
        setError("No se han podido cargar tus citas.");
        navigate("/admin/login");
      });
  }, [navigate]);

  const dateAppointments = appointments.filter(
    (appointment) => appointment.date === selectedDate.toISOString().slice(0, 10),
  );

  const appointmentDates = new Set(appointments.map((appointment) => appointment.date));

  function selectDate(value: CalendarValue) {
    if (value) setSelectedDate(value);
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      navigate("/admin/login");
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "agenda", label: "Agenda" },
    { id: "nueva", label: "Nueva cita" },
    { id: "telegram", label: "Telegram" },
  ];

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-6 border-b border-black/15 pb-8">
          <div>
            <Link to="/" className="text-xs uppercase tracking-[0.25em] text-black/50">
              Ronal Barber
            </Link>
            <h1 className="mt-4 font-display text-6xl uppercase flex flex-wrap items-baseline gap-4">
              Panel barbero, {user?.barber_name}.
            </h1>
          </div>
          <button onClick={logout} className="border border-black/25 px-5 py-3 text-xs uppercase tracking-[0.15em]">
            Cerrar sesión
          </button>
        </header>

        <nav className="mt-8 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-5 py-3 text-xs uppercase tracking-[0.15em] ${tab === item.id ? "bg-ink text-paper" : "border border-black/20"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "agenda" && (
          <div className="mt-12 grid gap-10 lg:grid-cols-[380px_1fr]">
            <section>
              <p className="mb-4 text-xs uppercase tracking-[0.2em] text-black/50">Selecciona un día</p>
              <Calendar
                onChange={(value) => selectDate(value as CalendarValue)}
                value={selectedDate}
                tileClassName={({ date }) =>
                  appointmentDates.has(date.toISOString().slice(0, 10)) ? "has-appointment" : undefined
                }
              />
            </section>
            <section>
              <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                {selectedDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
              <h2 className="mt-4 font-display text-4xl uppercase">Agenda del día</h2>
              {error && <p className="mt-5 text-red-700">{error}</p>}
              {dateAppointments.length === 0 ? (
                <p className="mt-8 text-black/50">No hay citas para este día.</p>
              ) : (
                <div className="mt-8 divide-y divide-black/15 border-y border-black/15">
                  {dateAppointments.map((appointment) => (
                    <article key={appointment.id} className="grid gap-3 py-6 sm:grid-cols-[120px_1fr_auto]">
                      <time className="font-display text-3xl">{appointment.start_time.slice(0, 5)}</time>
                      <div>
                        <h3 className="text-lg">{appointment.service_name}</h3>
                        <p className="text-sm text-black/55">
                          {appointment.customer_name} {appointment.customer_surname}
                        </p>
                        <p className="text-sm text-black/55">
                          {appointment.customer_phone} · {appointment.customer_email}
                        </p>
                      </div>
                      <span className="text-sm uppercase text-black/55">{appointment.status}</span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "nueva" && (
          <section className="mt-12 max-w-xl">
            <h2 className="font-display text-4xl uppercase">Nueva cita manual</h2>
            <p className="mt-4 text-sm text-black/60">Crea una cita para un cliente en el local.</p>
            <div className="mt-8">
              <ManualAppointmentForm
                barbers={barbers}
                defaultBarberId={user?.barber_id ?? undefined}
                isBarber
                onCreated={loadAppointments}
              />
            </div>
          </section>
        )}

        {tab === "telegram" && (
          <section className="mt-12 max-w-xl">
            <TelegramLink />
          </section>
        )}
      </div>
    </main>
  );
}
