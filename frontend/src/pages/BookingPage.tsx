import { ArrowLeft, ArrowRight, Calendar, CheckCircle2, Clock, Scissors, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import type { Barber, Service } from "../types/api";

const STEPS = [
  { id: 1, label: "Servicio", icon: Scissors },
  { id: 2, label: "Fecha y hora", icon: Calendar },
  { id: 3, label: "Tus datos", icon: User },
] as const;

function localTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function BookingPage() {
  const [searchParams] = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState(searchParams.get("service") ?? "");
  const [barberId, setBarberId] = useState(searchParams.get("barber") ?? "");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [message, setMessage] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const selectedService = useMemo(
    () => services.find((s) => String(s.id) === serviceId),
    [services, serviceId],
  );
  const selectedBarber = useMemo(
    () => barbers.find((b) => String(b.id) === barberId),
    [barbers, barberId],
  );

  useEffect(() => {
    Promise.all([api.getServices(), api.getBarbers()])
      .then(([loadedServices, loadedBarbers]) => {
        setServices(loadedServices);
        setBarbers(loadedBarbers);
      })
      .catch(() => setMessage("No hemos podido cargar la disponibilidad."));
  }, []);

  const todayIso = useMemo(() => localTodayIso(), []);

  useEffect(() => {
    if (step === 2 && !date) {
      setDate(todayIso);
    }
  }, [step, date, todayIso]);

  useEffect(() => {
    if (!serviceId || !date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSlot("");
    api
      .getAvailability(Number(serviceId), date, barberId ? Number(barberId) : undefined)
      .then(({ slots: loadedSlots }) => setSlots(loadedSlots))
      .catch(() => setMessage("No hemos podido cargar las horas disponibles."))
      .finally(() => setLoadingSlots(false));
  }, [serviceId, barberId, date]);

  function canAdvance(): boolean {
    if (step === 1) return Boolean(serviceId);
    if (step === 2) return Boolean(date && slot);
    return false;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await api.createAppointment({
        service_id: Number(serviceId),
        barber_id: barberId ? Number(barberId) : null,
        date,
        start_time: slot,
        customer_name: form.get("name"),
        customer_surname: form.get("surname"),
        customer_phone: form.get("phone"),
        customer_email: form.get("email"),
        privacy_accepted: form.get("privacy") === "on",
      });
      setConfirmed(true);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message.includes("409")
          ? "Esta hora acaba de ser reservada. Por favor selecciona otra."
          : "No hemos podido completar la reserva.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-6 py-24 text-paper">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
            <CheckCircle2 size={32} />
          </div>
          <p className="mt-8 text-[10px] uppercase tracking-[0.28em] text-accent">Reserva confirmada</p>
          <h1 className="mt-4 font-display text-5xl uppercase leading-none sm:text-6xl">Nos vemos en la silla.</h1>
          <p className="mt-6 text-white/55">
            Te hemos enviado un correo de confirmación con un enlace para cancelar si lo necesitas.
          </p>
          {selectedService && (
            <div className="mt-10 border border-white/10 bg-white/5 p-6 text-left text-sm">
              <p className="font-display text-xl uppercase">{selectedService.name}</p>
              <p className="mt-2 text-white/50">
                {date} · {slot}
                {selectedBarber ? ` · ${selectedBarber.name}` : ""}
              </p>
            </div>
          )}
          <Link
            to="/"
            className="mt-10 inline-flex items-center gap-2 bg-accent px-7 py-4 text-xs uppercase tracking-[0.14em] text-ink"
          >
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eceae4] text-ink">
      {/* Header */}
      <div className="bg-ink px-6 py-16 text-paper lg:px-10 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <Link to="/" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-accent">
            <ArrowLeft size={14} /> Ronal Barber
          </Link>
          <p className="mt-10 text-[10px] uppercase tracking-[0.28em] text-accent">Reserva online</p>
          <h1 className="mt-3 font-display text-5xl uppercase leading-none sm:text-6xl lg:text-7xl">
            Tu próxima cita.
          </h1>
          <p className="mt-5 max-w-lg text-white/55">
            Elige servicio, profesional, fecha y hora. La disponibilidad se calcula en tiempo real.
          </p>

          {/* Progress */}
          <div className="mt-12 flex gap-2 sm:gap-4">
            {STEPS.map(({ id, label, icon: Icon }) => {
              const active = step === id;
              const done = step > id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => id < step && setStep(id)}
                  disabled={id > step}
                  className={`flex flex-1 items-center gap-3 border px-4 py-3 text-left transition-colors sm:px-5 sm:py-4 ${
                    active
                      ? "border-accent bg-accent/10 text-accent"
                      : done
                        ? "border-white/20 bg-white/5 text-white/70"
                        : "border-white/10 text-white/30"
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="hidden text-[10px] uppercase tracking-[0.14em] sm:inline">{label}</span>
                  <span className="text-[10px] uppercase tracking-[0.14em] sm:hidden">{id}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1fr_320px] lg:gap-12 lg:px-10 lg:py-14">
        {/* Form area */}
        <div className="booking-panel">
          {step === 1 && (
            <div className="space-y-8">
              <div>
                <h2 className="font-display text-3xl uppercase">Elige tu servicio</h2>
                <p className="mt-2 text-sm text-black/50">Selecciona el tratamiento que necesitas.</p>
              </div>
              <div className="grid gap-3">
                {services.map((item) => {
                  const selected = serviceId === String(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setServiceId(String(item.id))}
                      className={`flex items-center justify-between gap-4 border p-5 text-left transition-all ${
                        selected
                          ? "border-ink bg-ink text-paper shadow-md"
                          : "border-black/10 bg-white hover:border-black/25"
                      }`}
                    >
                      <div>
                        <p className="font-display text-xl uppercase">{item.name}</p>
                        <p className={`mt-1 text-xs ${selected ? "text-paper/60" : "text-black/45"}`}>
                          {item.duration_minutes} min · {item.description}
                        </p>
                      </div>
                      <span className={`font-display text-2xl ${selected ? "text-accent" : ""}`}>{item.price} €</span>
                    </button>
                  );
                })}
              </div>

              <div>
                <h3 className="text-[10px] uppercase tracking-[0.18em] text-black/45">Barbero (opcional)</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setBarberId("")}
                    className={`border px-4 py-2.5 text-xs uppercase tracking-[0.12em] ${
                      !barberId ? "border-ink bg-ink text-paper" : "border-black/15 bg-white"
                    }`}
                  >
                    Cualquiera
                  </button>
                  {barbers.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setBarberId(String(item.id))}
                      className={`border px-4 py-2.5 text-xs uppercase tracking-[0.12em] ${
                        barberId === String(item.id) ? "border-ink bg-ink text-paper" : "border-black/15 bg-white"
                      }`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8">
              <div>
                <h2 className="font-display text-3xl uppercase">Fecha y hora</h2>
                <p className="mt-2 text-sm text-black/50">Selecciona cuándo quieres venir.</p>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-black/45">Fecha</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDate(todayIso);
                      setSlot("");
                    }}
                    className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                      date === todayIso
                        ? "border-ink bg-ink text-paper"
                        : "border-black/15 bg-white text-black/70 hover:border-accent hover:text-ink"
                    }`}
                  >
                    <Calendar size={12} />
                    Hoy
                  </button>
                </div>
                <input
                  required
                  type="date"
                  min={todayIso}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSlot("");
                  }}
                  className="mt-2 w-full max-w-xs border-b-2 border-black/20 bg-transparent py-3 outline-none focus:border-accent"
                />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-black/40" />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-black/45">Horas disponibles</span>
                </div>

                {!date && <p className="mt-4 text-sm text-black/40">Primero elige una fecha.</p>}
                {date && loadingSlots && <p className="mt-4 text-sm text-black/40">Buscando disponibilidad…</p>}
                {date && !loadingSlots && slots.length === 0 && (
                  <p className="mt-4 text-sm text-black/40">No hay huecos libres este día. Prueba otra fecha.</p>
                )}

                {slots.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {slots.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setSlot(item)}
                        className={`slot-btn border py-3 text-sm transition-all ${
                          slot === item
                            ? "border-ink bg-ink text-paper"
                            : "border-black/15 bg-white hover:border-accent"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={submit} className="space-y-8">
              <div>
                <h2 className="font-display text-3xl uppercase">Tus datos</h2>
                <p className="mt-2 text-sm text-black/50">Completa la información para confirmar la reserva.</p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-black/45">Nombre</span>
                  <input required name="name" className="mt-2 w-full border-b border-black/20 bg-transparent py-3 outline-none focus:border-ink" />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-black/45">Apellidos</span>
                  <input required name="surname" className="mt-2 w-full border-b border-black/20 bg-transparent py-3 outline-none focus:border-ink" />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-black/45">Teléfono</span>
                  <input required name="phone" type="tel" className="mt-2 w-full border-b border-black/20 bg-transparent py-3 outline-none focus:border-ink" />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-black/45">Email</span>
                  <input required name="email" type="email" className="mt-2 w-full border-b border-black/20 bg-transparent py-3 outline-none focus:border-ink" />
                </label>
              </div>

              <div className="rounded-sm border border-accent/25 bg-accent/5 px-5 py-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-black/45">Pago en el local</p>
                <p className="mt-2 text-sm leading-6 text-black/60">
                  El pago se realizará en efectivo o con tarjeta directamente en la barbería el día de tu cita.
                </p>
              </div>

              <label className="flex items-start gap-3 text-sm text-black/60">
                <input required type="checkbox" name="privacy" className="mt-1" />
                Acepto la política de privacidad y el tratamiento de mis datos para gestionar la cita.
              </label>

              {message && (
                <div className="border border-red-700/20 bg-red-700/5 px-4 py-3 text-sm text-red-700">{message}</div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 bg-ink py-4 text-xs uppercase tracking-[0.14em] text-paper disabled:opacity-50"
              >
                {submitting ? "Procesando…" : "Confirmar reserva"}
              </button>
            </form>
          )}

          {/* Navigation buttons (steps 1-2) */}
          {step < 3 && (
            <div className="mt-10 flex justify-between gap-4 border-t border-black/10 pt-8">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-black/50 hover:text-ink"
                >
                  <ArrowLeft size={14} /> Atrás
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={!canAdvance()}
                onClick={() => setStep(step + 1)}
                className="inline-flex items-center gap-2 bg-ink px-6 py-3.5 text-xs uppercase tracking-[0.14em] text-paper disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continuar <ArrowRight size={14} />
              </button>
            </div>
          )}

          {step === 3 && (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-black/50 hover:text-ink"
            >
              <ArrowLeft size={14} /> Cambiar fecha u hora
            </button>
          )}
        </div>

        {/* Summary sidebar */}
        <aside className="h-fit lg:sticky lg:top-8">
          <div className="border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-black/40">Resumen</p>

            <div className="mt-6 space-y-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-black/35">Servicio</p>
                <p className="mt-1 font-display text-xl uppercase">
                  {selectedService?.name ?? "—"}
                </p>
                {selectedService && (
                  <p className="mt-1 text-sm text-black/45">
                    {selectedService.duration_minutes} min · {selectedService.price} €
                  </p>
                )}
              </div>

              <div className="border-t border-black/10 pt-5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-black/35">Barbero</p>
                <p className="mt-1 text-sm">{selectedBarber?.name ?? "Cualquier disponible"}</p>
              </div>

              <div className="border-t border-black/10 pt-5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-black/35">Fecha y hora</p>
                <p className="mt-1 text-sm">
                  {date ? new Date(date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : "—"}
                </p>
                <p className="mt-1 font-display text-2xl">{slot || "—"}</p>
              </div>

              {selectedService && (
                <div className="border-t border-black/10 pt-5">
                  <div className="flex items-end justify-between">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-black/35">Total estimado</p>
                    <p className="font-display text-3xl text-accent">{selectedService.price} €</p>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-black/45">
                    Se abonará en efectivo o tarjeta en el local.
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-[10px] text-black/35">
            Confirmación por email · Cancelación online
          </p>
        </aside>
      </div>
    </main>
  );
}
