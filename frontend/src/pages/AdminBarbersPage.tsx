import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { Barber } from "../types/api";

const empty = {
  name: "",
  description: "",
  specialties: "",
  image_url: "",
  active: true,
};

export function AdminBarbersPage() {
  const { canEdit } = useStaff();
  const [items, setItems] = useState<Barber[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getBarbers(true)
      .then(setItems)
      .catch(() => {
        setError("No se han podido cargar los barberos.");
      });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();

    try {
      const saved = editing
        ? await api.updateBarber(editing, form)
        : await api.createBarber(form);

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
      setError("No se ha podido guardar el barbero.");
    }
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar este barbero?")) {
      return;
    }

    await api.deleteBarber(id);

    setItems(items.filter((item) => item.id !== id));
  }

  return (
    <section>
      <StaffPageHeader eyebrow="Equipo" title="Barberos" description={canEdit ? "Gestiona el equipo del local." : "Consulta el equipo de barberos."} />

      {canEdit && (
      <form
        onSubmit={save}
        className="mt-12 grid gap-4 border-y border-black/15 py-7 md:grid-cols-2"
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
          placeholder="Especialidades"
          value={form.specialties}
          onChange={(e) =>
            setForm({
              ...form,
              specialties: e.target.value,
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
          placeholder="URL de imagen"
          value={form.image_url}
          onChange={(e) =>
            setForm({
              ...form,
              image_url: e.target.value,
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
          {editing ? "Actualizar" : "Crear barbero"}
        </button>
      </form>
      )}

      {error && (
        <p className="mt-5 text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-sm border border-black/10 bg-white p-6 shadow-sm"
          >
            <div className="aspect-[4/3] bg-black/5">
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <h2 className="mt-5 font-display text-3xl uppercase">
              {item.name}
            </h2>

            <p className="mt-2 text-sm text-black/55">
              {item.specialties}
            </p>

            {canEdit && (
            <div className="mt-5 flex gap-4 text-xs uppercase">
              <button
                onClick={() => {
                  setEditing(item.id);
                  setForm({
                    name: item.name,
                    description: item.description,
                    specialties: item.specialties,
                    image_url: item.image_url,
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