import { Camera, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { TelegramLink } from "../components/TelegramLink";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { Barber } from "../types/api";

export function BarberConfigPage() {
  const { isBarberStaff, user, setUser } = useStaff();
  const [profile, setProfile] = useState<Barber | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isBarberStaff) return;
    api
      .getMyBarberProfile()
      .then((item) => {
        setProfile(item);
        setName(item.name);
        setDescription(item.description);
        setSpecialties(item.specialties);
        setPreviewUrl(item.image_url || null);
      })
      .catch(() => setError("No se ha podido cargar tu perfil."))
      .finally(() => setLoading(false));
  }, [isBarberStaff]);

  useEffect(() => {
    if (!pendingFile) return;
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  if (!isBarberStaff) {
    return <Navigate to="/admin" replace />;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      let saved = await api.updateMyBarberProfile({
        name,
        description,
        specialties,
        active: profile.active,
      });
      if (pendingFile) {
        saved = await api.uploadMyBarberPhoto(pendingFile);
        setPendingFile(null);
      }
      setProfile(saved);
      setPreviewUrl(saved.image_url || null);
      setUser({ ...user, barber_name: saved.name });
      setSuccess("Perfil actualizado.");
    } catch {
      setError("No se ha podido guardar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function removePhoto() {
    if (pendingFile) {
      setPendingFile(null);
      setPreviewUrl(profile?.image_url || null);
      return;
    }
    if (!profile?.image_url) return;
    try {
      const updated = await api.deleteMyBarberPhoto();
      setProfile(updated);
      setPreviewUrl(null);
      setSuccess("Foto eliminada.");
    } catch {
      setError("No se ha podido eliminar la foto.");
    }
  }

  return (
    <section>
      <StaffPageHeader
        eyebrow="Cuenta"
        title="Configuración"
        description="Tu nombre, foto de perfil y avisos de Telegram."
      />

      {loading ? (
        <p className="text-sm text-black/50">Cargando…</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <form onSubmit={save} className="rounded-sm border border-black/10 bg-white p-8 shadow-sm">
            <h3 className="font-display text-2xl uppercase">Mi perfil</h3>
            <p className="mt-2 text-sm text-black/55">Así te ven los clientes en la web.</p>

            <div className="mt-6 flex flex-wrap items-center gap-5">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-sm border border-black/10 bg-[#eceae4]">
                {previewUrl ? (
                  <img src={previewUrl} alt={name} className="h-full w-full object-cover" />
                ) : (
                  <Camera size={28} className="text-black/30" />
                )}
              </div>
              <div className="space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 border border-black/15 px-4 py-2 text-xs uppercase tracking-[0.14em] hover:border-accent">
                  <Camera size={14} />
                  Cambiar foto
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => setPendingFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                {(previewUrl || pendingFile) && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-red-800 hover:underline"
                  >
                    <Trash2 size={12} />
                    Quitar foto
                  </button>
                )}
              </div>
            </div>

            <label className="mt-6 block">
              <span className="text-[10px] uppercase tracking-[0.16em] text-black/45">Nombre</span>
              <input
                required
                minLength={2}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full border border-black/15 bg-[#eceae4]/40 px-4 py-3 text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-[10px] uppercase tracking-[0.16em] text-black/45">Especialidades</span>
              <input
                value={specialties}
                onChange={(event) => setSpecialties(event.target.value)}
                className="mt-2 w-full border border-black/15 bg-[#eceae4]/40 px-4 py-3 text-sm outline-none focus:border-accent"
                placeholder="Corte, barba…"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-[10px] uppercase tracking-[0.16em] text-black/45">Descripción</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="mt-2 w-full border border-black/15 bg-[#eceae4]/40 px-4 py-3 text-sm outline-none focus:border-accent"
              />
            </label>

            {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
            {success && <p className="mt-4 text-sm text-green-800">{success}</p>}

            <button
              type="submit"
              disabled={saving}
              className="mt-6 inline-flex items-center gap-2 bg-ink px-5 py-3 text-xs uppercase tracking-[0.14em] text-paper disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </form>

          <TelegramLink />
        </div>
      )}
    </section>
  );
}
