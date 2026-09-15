import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../services/api";
import type { Barber, Service } from "../types/api";

type Props = {
  barbers: Barber[];
  defaultBarberId?: number;
  isBarber?: boolean;
  onCreated?: () => void;
};

export function ManualAppointmentForm({ barbers, defaultBarberId, isBarber = false, onCreated }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [barberId, setBarberId] = useState(defaultBarberId ? String(defaultBarberId) : "");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getServices().then(setServices).catch(() => setError("No se pudieron cargar servicios."));
  }, []);

  useEffect(() => {
    if (!serviceId || !date) return;
    api
      .getAvailability(Number(serviceId), date, barberId ? Number(barberId) : undefined)
      .then(({ slots: loaded }) => setSlots(loaded))
      .catch(() => setError("No se pudieron cargar horas."));
  }, [serviceId, barberId, date]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await api.createManualAppointment({
        service_id: Number(serviceId),
        barber_id: barberId ? Number(barberId) : null,
        date,
        start_time: slot,
        customer_name: String(form.get("name")),
        customer_surname: String(form.get("surname")),
        customer_phone: String(form.get("phone")),
        customer_email: String(form.get("email")),
        send_customer_email: sendEmail,
      });
      setSuccess(true);
      event.currentTarget.reset();
      setServiceId("");
      setSlot("");
      setSlots([]);
      onCreated?.();
    } catch {
      setError("No se pudo crear la cita. Comprueba disponibilidad.");
    }
  }

  if (success) {
    return (
      <div className="border border-green-700/20 bg-green-700/5 p-6">
        <p className="text-sm text-green-800">Cita creada correctamente.</p>
        <button onClick={() => setSuccess(false)} className="mt-4 text-xs uppercase tracking-[0.15em] underline">
          Crear otra
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <select
        required
        value={serviceId}
        onChange={(e) => setServiceId(e.target.value)}
        className="w-full border-b border-black/25 bg-transparent py-3"
      >
        <option value="">Servicio</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {!isBarber && (
        <select
          required
          value={barberId}
          onChange={(e) => setBarberId(e.target.value)}
          className="w-full border-b border-black/25 bg-transparent py-3"
        >
          <option value="">Barbero</option>
          {barbers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      )}

      <input required type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="w-full border-b border-black/25 bg-transparent py-3" />

      {slots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => (
            <button key={s} type="button" onClick={() => setSlot(s)} className={`border px-4 py-2 text-sm ${slot === s ? "border-accent bg-accent/10" : "border-black/20"}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      <input required name="name" placeholder="Nombre" className="w-full border-b border-black/25 bg-transparent py-3" />
      <input required name="surname" placeholder="Apellidos" className="w-full border-b border-black/25 bg-transparent py-3" />
      <input required name="phone" placeholder="Teléfono" className="w-full border-b border-black/25 bg-transparent py-3" />
      <input required type="email" name="email" placeholder="Email" className="w-full border-b border-black/25 bg-transparent py-3" />

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
        Enviar email de confirmación al cliente
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button type="submit" disabled={!slot} className="bg-ink px-6 py-3 text-xs uppercase tracking-[0.15em] text-paper disabled:opacity-40">
        Crear cita
      </button>
    </form>
  );
}
