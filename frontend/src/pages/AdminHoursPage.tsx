import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { BusinessHour } from "../types/api";

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
  const { canEdit } = useStaff();
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [day, setDay] = useState(0);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("14:00");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getHours()
      .then(setHours)
      .catch(() => {
        setError("No se han podido cargar los horarios.");
      });
  }, []);

  async function persistHours(next: BusinessHour[]) {
    try {
      const saved = await api.replaceHours(next);
      setHours(saved);
      setError("");
    } catch {
      setError("No se han podido guardar los horarios.");
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();

    if (start >= end) {
      return setError("La hora de inicio debe ser anterior a la hora final.");
    }

    const next = [
      ...hours,
      {
        day_of_week: day,
        start_time: start,
        end_time: end,
        active: true,
      },
    ];

    await persistHours(next);
  }

  async function removeSlot(item: BusinessHour) {
    await persistHours(hours.filter((candidate) => candidate !== item));
  }

  return (
    <section>
      <StaffPageHeader
        eyebrow="Operativa"
        title="Horarios"
        description={canEdit ? "Añade franjas por día. Sin franjas = día bloqueado." : "Consulta los horarios de apertura del local."}
      />

      {canEdit && (
      <form
        onSubmit={add}
        className="mt-12 grid gap-4 border-y border-black/15 py-7 md:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <select
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="border-b border-black/25 bg-transparent py-3"
        >
          {days.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>

        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="border-b border-black/25 bg-transparent py-3"
        />

        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="border-b border-black/25 bg-transparent py-3"
        />

        <button type="submit" className="bg-ink px-5 py-3 text-xs uppercase text-paper">
          Añadir franja
        </button>
      </form>
      )}

      {error && <p className="mt-5 text-red-700">{error}</p>}

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {days.map((label, index) => {
          const rows = hours.filter(
            (item) => item.day_of_week === index
          );

          return (
            <article
              key={label}
              className="rounded-sm border border-black/10 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-3xl uppercase">
                  {label}
                </h2>

                <span
                  className={
                    rows.length
                      ? "text-green-700"
                      : "text-red-700"
                  }
                >
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

                    {canEdit && (
                    <button
                      type="button"
                      onClick={() => void removeSlot(item)}
                      className="text-xs uppercase text-red-700"
                    >
                      Bloquear franja
                    </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="mt-5 text-sm text-black/50">
                  Sin franjas activas.
                </p>
              )}

            </article>
          );
        })}
      </div>
    </section>
  );
}