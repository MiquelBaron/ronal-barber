import { useEffect, useState } from "react";
import type { FormEvent } from "react";

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
};

export function AdminServicesPage() {
  const { canEdit } = useStaff();
  const [items, setItems] = useState<Service[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getServices(true)
      .then(setItems)
      .catch(() => {
        setError("No se han podido cargar los servicios.");
      });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();

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
        description={canEdit ? "Precio y duración controlan la disponibilidad." : "Consulta el catálogo de servicios del local."}
      />

      {canEdit && (
      <form
        onSubmit={save}
        className="mt-12 grid gap-4 border-y border-black/15 py-7 md:grid-cols-[1fr_1.5fr_120px_120px_auto]"
      >
        <input
          required
          placeholder="Nombre"
          value={form.name}
          onChange={(e) =>
            setForm({
              ...form,
              name: e.target.value,
            })
          }
          className="border-b border-black/25 bg-transparent py-3"
        />

        <input
          placeholder="Descripción"
          value={form.description}
          onChange={(e) =>
            setForm({
              ...form,
              description: e.target.value,
            })
          }
          className="border-b border-black/25 bg-transparent py-3"
        />

        <input
          required
          type="number"
          min="1"
          step="0.01"
          placeholder="Precio"
          value={form.price}
          onChange={(e) =>
            setForm({
              ...form,
              price: e.target.value,
            })
          }
          className="border-b border-black/25 bg-transparent py-3"
        />

        <input
          required
          type="number"
          min="1"
          placeholder="Minutos"
          value={form.duration_minutes}
          onChange={(e) =>
            setForm({
              ...form,
              duration_minutes: Number(e.target.value),
            })
          }
          className="border-b border-black/25 bg-transparent py-3"
        />

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