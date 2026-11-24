import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Field, fieldInputClass } from "./Field";
import { api } from "../services/api";
import type { Barber, Service } from "../types/api";
import { complementOptions, defaultServiceId, independentServices } from "../utils/services";

type Props = {
  barbers: Barber[];
  defaultBarberId?: number;
  defaultDate?: string;
  isBarber?: boolean;
  onCreated?: () => void;
  onCancel?: () => void;
};

export function ManualAppointmentForm({
  barbers,
  defaultBarberId,
  defaultDate = "",
  isBarber = false,
  onCreated,
  onCancel,
}: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [complementIds, setComplementIds] = useState<number[]>([]);
  const [barberId, setBarberId] = useState(defaultBarberId ? String(defaultBarberId) : "");
  const [date, setDate] = useState(defaultDate);
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (defaultBarberId) setBarberId(String(defaultBarberId));
  }, [defaultBarberId]);

  useEffect(() => {
    if (defaultDate) {
      setDate(defaultDate);
      setSlot("");
    }
  }, [defaultDate]);

  useEffect(() => {
    api
      .getServices()
      .then((loaded) => {
        setServices(loaded);
        setServiceId((current) => current || defaultServiceId(loaded));
      })
      .catch(() => setError("No se pudieron cargar servicios."));
  }, []);

  useEffect(() => {
    if (!serviceId || !date) {
      setSlots([]);
      return;
    }
    setSlot("");
    api
      .getStaffAvailability(Number(serviceId), date, barberId ? Number(barberId) : undefined, complementIds)
      .then(({ slots: loaded }) => setSlots(loaded))
      .catch(() => setError("No se pudieron cargar horas."));
  }, [serviceId, barberId, date, complementIds]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await api.createManualAppointment({
        service_id: Number(serviceId),
        complement_ids: complementIds,
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
      setServiceId(defaultServiceId(services));
      setComplementIds([]);
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
      <Field label="Servicio">
        <select
          required
          aria-label="Servicio"
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            setComplementIds([]);
          }}
          className={fieldInputClass}
        >
          <option value="">Elige servicio</option>
          {independentServices(services).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>

      {complementOptions(services, serviceId).length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-[10px] uppercase tracking-[0.16em] text-black/45">Extras</legend>
          {complementOptions(services, serviceId).map((item) => (
            <label key={item.id} className="flex items-center justify-between gap-3 border-b border-black/10 py-2 text-sm">
              <span>
                <input
                  type="checkbox"
                  className="mr-3"
                  checked={complementIds.includes(item.id)}
                  onChange={() =>
                    setComplementIds((current) =>
                      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
                    )
                  }
                />
                + {item.name}
              </span>
              <span className="text-black/45">
                {item.duration_minutes} min · {item.price} €
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {!isBarber && (
        <Field label="Barbero">
          <select
            required
            aria-label="Barbero"
            value={barberId}
            onChange={(e) => setBarberId(e.target.value)}
            className={fieldInputClass}
          >
            <option value="">Elige barbero</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Fecha">
        <input
          required
          type="date"
          aria-label="Fecha de la cita"
          value={date}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          className={fieldInputClass}
        />
      </Field>

      {slots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => (
            <button key={s} type="button" onClick={() => setSlot(s)} className={`border px-4 py-2 text-sm ${slot === s ? "border-accent bg-accent/10" : "border-black/20"}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      <Field label="Nombre">
        <input required name="name" aria-label="Nombre" placeholder="Nombre del cliente" className={fieldInputClass} />
      </Field>
      <Field label="Apellidos">
        <input required name="surname" aria-label="Apellidos" placeholder="Apellidos del cliente" className={fieldInputClass} />
      </Field>
      <Field label="Teléfono">
        <input required name="phone" aria-label="Teléfono" placeholder="600 000 000" className={fieldInputClass} />
      </Field>
      <Field label="Email">
        <input required type="email" name="email" aria-label="Email" placeholder="cliente@email.com" className={fieldInputClass} />
      </Field>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
        Enviar email de confirmación al cliente
      </label>

      {date && !error && slots.length === 0 && (
        <p className="text-sm text-black/45">No hay horas libres para este día.</p>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!slot} className="bg-ink px-6 py-3 text-xs uppercase tracking-[0.15em] text-paper disabled:opacity-40">
          Crear cita
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="border border-black/20 px-6 py-3 text-xs uppercase tracking-[0.15em] text-black/60 hover:border-black/40"
          >
            Cerrar
          </button>
        )}
      </div>
    </form>
  );
}
