import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { Barber } from "../types/api";

type BarberForm = Pick<Barber, "name" | "description" | "specialties" | "active">;

const empty: BarberForm = {
  name: "",
  description: "",
  specialties: "",
  active: true,
};

export function AdminBarbersPage() {
  const { canEdit } = useStaff();
  const [items, setItems] = useState<Barber[]>([]);
  const [form, setForm] = useState<BarberForm>(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getBarbers(true)
      .then(setItems)
      .catch(() => {
        setError("No se han podido cargar los barberos.");
      });
  }, []);

  useEffect(() => {
    if (!pendingFile) return;
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  function resetForm() {
    setForm(empty);
    setEditing(null);
    setPendingFile(null);
    setPreviewUrl(null);
  }

  function startEdit(item: Barber) {
    setEditing(item.id);
    setForm({
      name: item.name,
      description: item.description,
      specialties: item.specialties,
      active: item.active,
    });
    setPendingFile(null);
    setPreviewUrl(item.image_url || null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      let saved = editing
        ? await api.updateBarber(editing, form)
        : await api.createBarber(form);

      if (pendingFile) {
        saved = await api.uploadBarberPhoto(saved.id, pendingFile);
      }

      setItems(editing ? items.map((item) => (item.id === editing ? saved : item)) : [...items, saved]);
      resetForm();
    } catch {
      setError("No se ha podido guardar el barbero.");
    } finally {
      setSaving(false);
    }
  }

  async function removePhoto() {
    if (pendingFile) {
      setPendingFile(null);
      if (editing) {
        const current = items.find((item) => item.id === editing);
        setPreviewUrl(current?.image_url || null);
      } else {
        setPreviewUrl(null);
      }
      return;
    }

    if (!editing) return;

    try {
      const updated = await api.deleteBarberPhoto(editing);
      setItems(items.map((item) => (item.id === editing ? updated : item)));
      setPreviewUrl(null);
    } catch {
      setError("No se ha podido eliminar la foto.");
    }
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar este barbero?")) return;
    await api.deleteBarber(id);
    setItems(items.filter((item) => item.id !== id));
    if (editing === id) resetForm();
  }

  return (
    <section>
      <StaffPageHeader
        eyebrow="Equipo"
        title="Barberos"
        description={canEdit ? "Gestiona el equipo del local." : "Consulta el equipo de barberos."}
      />

      {canEdit && (
        <form onSubmit={save} className="mt-12 grid gap-6 border-y border-black/15 py-7 lg:grid-cols-[220px_1fr]">
          <div className="space-y-3">
            <div className="aspect-[4/5] overflow-hidden border border-black/10 bg-black/5">
              {previewUrl ? (
                <img src={previewUrl} alt="Vista previa" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-xs uppercase tracking-[0.14em] text-black/35">
                  Sin foto
                </div>
              )}
            </div>
            <label className="block">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-black/45">Foto del barbero</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-black/60 file:mr-3 file:border-0 file:bg-ink file:px-3 file:py-2 file:text-[10px] file:uppercase file:tracking-[0.12em] file:text-paper"
              />
            </label>
            {(previewUrl || pendingFile) && (
              <button
                type="button"
                onClick={removePhoto}
                className="text-[10px] uppercase tracking-[0.14em] text-red-700"
              >
                Quitar foto
              </button>
            )}
            <p className="text-[10px] leading-5 text-black/40">JPG, PNG o WebP. Máximo 5 MB.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <input
              required
              placeholder="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border-b border-black/25 bg-transparent py-3"
            />
            <input
              placeholder="Especialidades"
              value={form.specialties}
              onChange={(e) => setForm({ ...form, specialties: e.target.value })}
              className="border-b border-black/25 bg-transparent py-3"
            />
            <input
              placeholder="Descripción"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="border-b border-black/25 bg-transparent py-3 md:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Activo
            </label>
            <div className="flex gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-ink px-5 py-3 text-xs uppercase text-paper disabled:opacity-50"
              >
                {saving ? "Guardando…" : editing ? "Actualizar" : "Crear barbero"}
              </button>
              {editing && (
                <button type="button" onClick={resetForm} className="px-5 py-3 text-xs uppercase text-black/50">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </form>
      )}

      {error && <p className="mt-5 text-red-700">{error}</p>}

      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-sm border border-black/10 bg-white shadow-sm">
            <div className="aspect-[4/3] bg-black/5">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center font-display text-4xl uppercase text-black/10">
                  {item.name.slice(0, 1)}
                </div>
              )}
            </div>
            <div className="p-6">
              <h2 className="font-display text-3xl uppercase">{item.name}</h2>
              <p className="mt-2 text-sm text-black/55">{item.specialties}</p>
              {canEdit && (
                <div className="mt-5 flex gap-4 text-xs uppercase">
                  <button onClick={() => startEdit(item)}>Editar</button>
                  <button onClick={() => remove(item.id)} className="text-red-700">
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
