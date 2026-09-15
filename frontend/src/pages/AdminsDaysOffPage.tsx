import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { Barber, DayOff } from "../types/api";

const empty = {
  barber_id: 0,
  start_date: "",
  end_date: "",
  reason: "",
};

export function AdminDaysOffPage() {
  const { isLimitedBarber, user } = useStaff();
  const [items, setItems] = useState<DayOff[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.getDaysOff(isLimitedBarber ? user.barber_id ?? undefined : undefined),
      api.getBarbers(),
    ])
      .then(([daysOff, barberList]) => {
        setItems(daysOff);
        setBarbers(barberList);
        const defaultBarberId = isLimitedBarber ? user.barber_id ?? barberList[0]?.id : barberList[0]?.id;
        if (defaultBarberId) {
          setForm((current) => ({ ...current, barber_id: defaultBarberId }));
        }
      })
      .catch(() => {
        setError("No se han podido cargar los días libres.");
      });
  }, [isLimitedBarber, user.barber_id]);

  async function save(event: FormEvent) {
    event.preventDefault();

    if (form.start_date > form.end_date) {
      setError("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }

    try {
      const saved = isLimitedBarber
        ? await api.createMyDayOff({
            start_date: form.start_date,
            end_date: form.end_date,
            reason: form.reason,
          })
        : await api.createDayOff({
            barber_id: Number(form.barber_id),
            start_date: form.start_date,
            end_date: form.end_date,
            reason: form.reason,
          });

      setItems([...items, saved]);

      setForm({
        ...empty,
        barber_id: form.barber_id,
      });

      setError("");
    } catch {
      setError("No se ha podido crear el día libre.");
    }
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar este periodo de vacaciones?")) {
      return;
    }

    try {
      if (isLimitedBarber) await api.deleteMyDayOff(id);
      else await api.deleteDayOff(id);

      setItems(items.filter((item) => item.id !== id));
    } catch {
      setError("No se ha podido eliminar el día libre.");
    }
  }

  function getBarberName(barberId: number) {
    return (
      barbers.find((barber) => barber.id === barberId)?.name ??
      "Barbero desconocido"
    );
  }

  return (
    <section>
      <StaffPageHeader
        eyebrow="Disponibilidad"
        title="Días libres"
        description={isLimitedBarber ? "Gestiona tus vacaciones y ausencias." : "Gestiona vacaciones, festivos y ausencias de los barberos."}
      />

      <form
        onSubmit={save}
        className="mt-12 grid gap-4 border-y border-black/15 py-7 md:grid-cols-[1.2fr_1fr_1fr_1.5fr_auto]"
      >
        {!isLimitedBarber && (
        <select
          required
          value={form.barber_id}
          onChange={(e) => setForm({ ...form, barber_id: Number(e.target.value) })}
          className="border-b border-black/25 bg-transparent py-3"
        >
          <option value={0} disabled>Barbero</option>
          {barbers.map((barber) => (
            <option key={barber.id} value={barber.id}>{barber.name}</option>
          ))}
        </select>
        )}

        <input
          required
          type="date"
          value={form.start_date}
          onChange={(e) =>
            setForm({
              ...form,
              start_date: e.target.value,
            })
          }
          className="border-b border-black/25 bg-transparent py-3"
        />

        <input
          required
          type="date"
          value={form.end_date}
          onChange={(e) =>
            setForm({
              ...form,
              end_date: e.target.value,
            })
          }
          className="border-b border-black/25 bg-transparent py-3"
        />

        <input
          placeholder="Motivo (opcional)"
          value={form.reason}
          onChange={(e) =>
            setForm({
              ...form,
              reason: e.target.value,
            })
          }
          className="border-b border-black/25 bg-transparent py-3"
        />

        <button
          type="submit"
          className="bg-ink px-5 py-3 text-xs uppercase text-paper"
        >
          Crear
        </button>
      </form>

      {error && (
        <p className="mt-5 text-red-700">
          {error}
        </p>
      )}

      <div className="divide-y divide-black/10 rounded-sm border border-black/10 bg-white shadow-sm">
        {items.map((item) => (
          <article
            key={item.id}
            className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_1.5fr_1fr_auto] md:items-center"
          >
            <div>
              <h2 className="font-display text-3xl uppercase">
                {getBarberName(item.barber_id)}
              </h2>

              <p className="mt-1 text-sm text-black/50">
                {item.reason || "Sin motivo especificado"}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-black/40">
                Periodo
              </p>

              <p className="mt-1">
                {item.start_date} → {item.end_date}
              </p>
            </div>

            <p className="text-sm text-black/50">
              No disponible para reservas
            </p>

            <button
              onClick={() => remove(item.id)}
              className="text-xs uppercase tracking-[0.12em] text-red-700"
            >
              Eliminar
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}