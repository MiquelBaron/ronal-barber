import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { Field, fieldInputClass } from "../components/Field";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { Service } from "../types/api";

const empty = {
  name: "",
  description: "",
  price: "0",
  duration_minutes: 30,
  active: true,
  is_independent: true,
  is_complement: false,
};

export function AdminServicesPage() {
  const { canEdit, isLimitedBarber } = useStaff();
  const [items, setItems] = useState<Service[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLimitedBarber) return;
    api
      .getServices(true)
      .then(setItems)
      .catch(() => {
        setError("No se han podido cargar los servicios.");
      });
  }, [isLimitedBarber]);

  if (isLimitedBarber) {
    return <Navigate to="/admin/agenda" replace />;
  }

  async function save(event: FormEvent) {
    event.preventDefault();

    if (!form.is_independent && !form.is_complement) {
      setError("Marca al menos Independiente o Complemento.");
      return;
    }

    try {
      const payload = {
        ...form,
        price: Number(form.price),
        duration_minutes: Number(form.duration_minutes),
      };

      const saved = editing
        ? await api.updateService(editing, payload)
        : await api.createService(payload);

      setItems(
        editing
          ? items.map((item) =>
              item.id === editing ? saved : item
            )
          : [...items, saved]
      );

      setForm(empty);
      setEditing(null);
    } catch {
      setError("No se ha podido guardar el servicio.");
    }
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar este servicio?")) {
      return;
    }

    await api.deleteService(id);

    setItems(items.filter((item) => item.id !== id));
  }

  return (
    <section>
      <StaffPageHeader
        eyebrow="Catálogo"
        title="Servicios"
        description={
          canEdit
            ? "Independiente = se reserva solo. Complemento = extra “+” de otro servicio."
            : "Consulta el catálogo de servicios del local."
        }
      />

      {canEdit && (
      <form
        onSubmit={save}
        className="mt-12 grid gap-4 border-y border-black/15 py-7 md:grid-cols-[1fr_1.5fr_120px_120px_auto]"
      >
        <Field label="Nombre">
          <input
            required
            aria-label="Nombre del servicio"
            placeholder="Corte clásico"
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
              })
            }
            className={fieldInputClass}
          />
        </Field>

        <Field label="Descripción">
          <input
            aria-label="Descripción del servicio"
            placeholder="Qué incluye el servicio"
            value={form.description}
            onChange={(e) =>
              setForm({
                ...form,
                description: e.target.value,
              })
            }
            className={fieldInputClass}
          />
        </Field>

        <Field label="Precio (€)">
          <input
            required
            type="number"
            min="1"
            step="0.01"
            aria-label="Precio en euros"
            placeholder="18"
            value={form.price}
            onChange={(e) =>
              setForm({
                ...form,
                price: e.target.value,
              })
            }
            className={fieldInputClass}
          />
        </Field>

        <Field label="Duración (min)">
          <input
            required
            type="number"
            min="1"
            aria-label="Duración en minutos"
            placeholder="30"
            value={form.duration_minutes}
            onChange={(e) =>
              setForm({
                ...form,
                duration_minutes: Number(e.target.value),
              })
            }
            className={fieldInputClass}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_independent}
            onChange={(e) => setForm({ ...form, is_independent: e.target.checked })}
          />
          Independiente
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_complement}
            onChange={(e) => setForm({ ...form, is_complement: e.target.checked })}
          />
          Complemento
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Activo
        </label>

        <button className="bg-ink px-5 py-3 text-xs uppercase text-paper">
          {editing ? "Actualizar" : "Crear"}
        </button>
      </form>
      )}

      {error && (
        <p className="mt-5 text-red-700">
          {error}
        </p>
      )}

      <div className="divide-y divide-black/10 rounded-sm border border-black/10 bg-white shadow-sm">
        {items.map((item) => (
          <article
            key={item.id}
            className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_1.5fr_auto_auto] md:items-center"
          >
            <div>
              <h2 className="font-display text-3xl uppercase">
                {item.name}
              </h2>

              <p className="text-sm text-black/55">
                {item.active ? "Activo" : "Inactivo"}
                {item.is_independent ? " · Independiente" : ""}
                {item.is_complement ? " · Complemento" : ""}
              </p>
            </div>

            <p className="text-black/60">
              {item.description}
            </p>

            <span>
              {item.duration_minutes} min · {item.price} €
            </span>

            {canEdit && (
            <div className="flex gap-4 text-xs uppercase">
              <button
                onClick={() => {
                  setEditing(item.id);
                  setForm({
                    name: item.name,
                    description: item.description,
                    price: item.price,
                    duration_minutes: item.duration_minutes,
                    active: item.active,
                    is_independent: item.is_independent,
                    is_complement: item.is_complement,
                  });
                }}
              >
                Editar
              </button>
              <button onClick={() => remove(item.id)} className="text-red-700">Eliminar</button>
            </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}