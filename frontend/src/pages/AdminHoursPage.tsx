import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { Barber, BusinessHour } from "../types/api";

const days = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export function AdminHoursPage() {
  const { canEdit, isLimitedBarber, user } = useStaff();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedBarberId, setSelectedBarberId] = useState<number | null>(null);
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [day, setDay] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");

  const canManageHours = canEdit || isLimitedBarber;
  const barberId = selectedBarberId ?? user.barber_id ?? null;

  useEffect(() => {
    api
      .getBarbers(true)
      .then((list) => {
        setBarbers(list);
        if (isLimitedBarber && user.barber_id) {
          setSelectedBarberId(user.barber_id);
        } else if (list[0]) {
          setSelectedBarberId(list[0].id);
        }
      })
      .catch(() => setError("No se han podido cargar los barberos."));
  }, [isLimitedBarber, user.barber_id]);

  useEffect(() => {
    if (!barberId) return;
    api
      .getHours(barberId)
      .then(setHours)
      .catch(() => setError("No se han podido cargar los horarios."));
  }, [barberId]);

  async function persistHours(next: BusinessHour[]) {
    if (!barberId) return false;
    try {
      const saved = await api.replaceHours(
        barberId,
        next.map((item) => ({ ...item, barber_id: barberId })),
      );
      setHours(saved);
      setError("");
      return true;
    } catch {
      setError("No se han podido guardar los horarios.");
      return false;
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!barberId) return;

    if (day === "" || !start || !end) {
      return setError("Elige el día, la hora de inicio y la hora de fin.");
    }

    if (start >= end) {
      return setError("La hora de inicio debe ser anterior a la hora final.");
    }

    const next = [
      ...hours,
      {
        barber_id: barberId,
        day_of_week: Number(day),
        start_time: start,
        end_time: end,
        active: true,
      },
    ];

    const saved = await persistHours(next);
    if (!saved) return;
    setDay("");
    setStart("");
    setEnd("");
  }

  async function removeSlot(item: BusinessHour) {
    await persistHours(hours.filter((candidate) => candidate !== item));
  }

  return (
    <section>
      <StaffPageHeader
        eyebrow="Operativa"
        title="Horarios"
        description={
          canManageHours
            ? "Franjas por barbero. Sin franjas = día bloqueado para ese profesional."
            : "Consulta los horarios de cada barbero."
        }
      />

      {canEdit && barbers.length > 0 && (
        <label className="mt-8 block max-w-sm">
          <span className="text-[10px] uppercase tracking-[0.16em] text-black/45">Barbero</span>
          <select
            value={selectedBarberId ?? ""}
            onChange={(e) => setSelectedBarberId(Number(e.target.value))}
            className="mt-2 w-full border-b border-black/25 bg-transparent py-3"
          >
            {barbers.map((barber) => (
              <option key={barber.id} value={barber.id}>
                {barber.name}
                {!barber.active ? " (inactivo)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {isLimitedBarber && (
        <p className="mt-8 text-sm text-black/55">Editando tu horario: {user.barber_name ?? "barbero"}</p>
      )}

      {canManageHours && barberId && (
        <form
          onSubmit={add}
          className="mt-8 grid gap-4 border-y border-black/15 py-7 md:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.16em] text-black/45">Día</span>
            <select
              required
              aria-label="Día"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className={`mt-2 w-full border-b border-black/25 bg-transparent py-3 ${day === "" ? "text-black/40" : ""}`}
            >
              <option value="" disabled>
                Elige el día
              </option>
              {days.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="relative block">
            <span className="text-[10px] uppercase tracking-[0.16em] text-black/45">Hora de inicio</span>
            {!start && (
              <span className="pointer-events-none absolute left-0 top-[2.15rem] text-sm text-black/40">
                Elige hora de inicio
              </span>
            )}
            <input
              required
              type="time"
              aria-label="Hora de inicio"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={`mt-2 w-full border-b border-black/25 bg-transparent py-3 ${start ? "" : "text-transparent"}`}
            />
          </label>

          <label className="relative block">
            <span className="text-[10px] uppercase tracking-[0.16em] text-black/45">Hora de fin</span>
            {!end && (
              <span className="pointer-events-none absolute left-0 top-[2.15rem] text-sm text-black/40">
                Elige hora de fin
              </span>
            )}
            <input
              required
              type="time"
              aria-label="Hora de fin"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={`mt-2 w-full border-b border-black/25 bg-transparent py-3 ${end ? "" : "text-transparent"}`}
            />
          </label>

          <button type="submit" className="self-end bg-ink px-5 py-3 text-xs uppercase text-paper">
            Añadir franja
          </button>
        </form>
      )}

      {error && <p className="mt-5 text-red-700">{error}</p>}

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {days.map((label, index) => {
          const rows = hours.filter((item) => item.day_of_week === index);

          return (
            <article key={label} className="rounded-sm border border-black/10 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-3xl uppercase">{label}</h2>
                <span className={rows.length ? "text-green-700" : "text-red-700"}>
                  {rows.length ? "Abierto" : "Bloqueado"}
                </span>
              </div>

              {rows.length ? (
                rows.map((item, rowIndex) => (
                  <div
                    key={`${item.start_time}-${rowIndex}`}
                    className="mt-5 flex justify-between border-t border-black/10 pt-4"
                  >
                    <span>
                      {item.start_time} - {item.end_time}
                    </span>
                    {canManageHours && (
                      <button
                        type="button"
                        onClick={() => void removeSlot(item)}
                        className="text-xs uppercase text-red-700"
                      >
                        Eliminar franja
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="mt-5 text-sm text-black/50">Sin franjas activas.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
