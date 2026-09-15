import {
  Bell,
  Clock,
  Globe,
  Mail,
  Save,
  Send,
  Shield,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { SettingItem, SettingsResponse } from "../types/api";

const GROUP_ORDER = ["general", "security", "email", "telegram", "scheduler"];

const GROUP_META: Record<string, { icon: React.ComponentType<{ size?: number; className?: string }>; color: string }> = {
  general: { icon: Globe, color: "text-sky-700 bg-sky-50 border-sky-100" },
  security: { icon: Shield, color: "text-violet-700 bg-violet-50 border-violet-100" },
  email: { icon: Mail, color: "text-amber-700 bg-amber-50 border-amber-100" },
  telegram: { icon: Bell, color: "text-cyan-700 bg-cyan-50 border-cyan-100" },
  scheduler: { icon: Clock, color: "text-emerald-700 bg-emerald-50 border-emerald-100" },
};

export function AdminSettingsPage() {
  const { isAdmin } = useStaff();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [activeGroup, setActiveGroup] = useState(GROUP_ORDER[0]);

  useEffect(() => {
    api
      .getAdminSettings()
      .then((response) => {
        setData(response);
        const initial: Record<string, string> = {};
        for (const item of response.items) initial[item.key] = item.value;
        setValues(initial);
      })
      .catch(() => setError("No se pudo cargar la configuración."));
  }, []);

  const groupedItems = useMemo(() => {
    if (!data) return new Map<string, SettingItem[]>();
    const map = new Map<string, SettingItem[]>();
    for (const item of data.items) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return map;
  }, [data]);

  if (!isAdmin) return <Navigate to="/admin/appointments" replace />;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await api.updateAdminSettings(values);
      setData(response);
      const refreshed: Record<string, string> = {};
      for (const item of response.items) refreshed[item.key] = item.value;
      setValues(refreshed);
      setSuccess("Configuración guardada. Los cambios se aplican al instante.");
    } catch {
      setError("No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail() {
    if (!testEmail) return;
    setError("");
    setSuccess("");
    try {
      const result = await api.testAdminEmail(testEmail);
      setSuccess(result.message);
    } catch {
      setError("Falló el envío de prueba. Revisa SMTP.");
    }
  }

  function renderField(item: SettingItem) {
    const inputClass =
      "mt-2 w-full rounded-sm border border-black/10 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";

    if (item.type === "bool") {
      return (
        <button
          type="button"
          onClick={() => setValues({ ...values, [item.key]: values[item.key] === "true" ? "false" : "true" })}
          className={`mt-3 inline-flex items-center gap-3 rounded-sm border px-4 py-3 text-sm transition-colors ${
            values[item.key] === "true"
              ? "border-accent bg-accent/10 text-ink"
              : "border-black/10 bg-white text-black/55"
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${values[item.key] === "true" ? "bg-accent" : "bg-black/20"}`} />
          {values[item.key] === "true" ? "Activado" : "Desactivado"}
        </button>
      );
    }

    if (item.type === "select" && item.options) {
      return (
        <select value={values[item.key] ?? ""} onChange={(e) => setValues({ ...values, [item.key]: e.target.value })} className={inputClass}>
          {item.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={item.type === "secret" ? "password" : item.type === "int" ? "number" : "text"}
        value={values[item.key] ?? ""}
        placeholder={item.is_secret && item.has_value ? "Dejar en blanco para mantener el valor actual" : ""}
        onChange={(e) => setValues({ ...values, [item.key]: e.target.value })}
        className={inputClass}
      />
    );
  }

  if (!data) {
    return <p className="text-black/50">Cargando configuración...</p>;
  }

  const currentItems = groupedItems.get(activeGroup) ?? [];
  const activeMeta = GROUP_META[activeGroup];
  const ActiveIcon = activeMeta?.icon ?? Globe;

  return (
    <section>
      <StaffPageHeader
        eyebrow="Sistema"
        title="Configuración"
        description="Parámetros en tiempo real. Cambia SMTP, Telegram, recordatorios y URLs sin redeploy."
      />

      <p className="mb-8 rounded-sm border border-black/10 bg-white/60 px-4 py-3 text-xs text-black/50">{data.bootstrap_note}</p>

      {error && <p className="mb-6 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {success && <p className="mb-6 rounded-sm border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</p>}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {data.groups
            .filter((group) => GROUP_ORDER.includes(group.id))
            .sort((a, b) => GROUP_ORDER.indexOf(a.id) - GROUP_ORDER.indexOf(b.id))
            .map((group) => {
              const meta = GROUP_META[group.id];
              const Icon = meta?.icon ?? Globe;
              const active = activeGroup === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroup(group.id)}
                  className={`flex w-full items-center gap-3 rounded-sm border px-4 py-4 text-left transition-all ${
                    active ? "border-accent bg-white shadow-sm" : "border-transparent bg-white/50 hover:border-black/10 hover:bg-white"
                  }`}
                >
                  <span className={`rounded-sm border p-2 ${meta?.color ?? ""}`}>
                    <Icon size={16} />
                  </span>
                  <span className="text-xs uppercase tracking-[0.14em]">{group.label}</span>
                </button>
              );
            })}
        </aside>

        <form onSubmit={save} className="rounded-sm border border-black/10 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-4 border-b border-black/10 pb-6">
            <span className={`rounded-sm border p-3 ${activeMeta?.color ?? ""}`}>
              <ActiveIcon size={20} />
            </span>
            <div>
              <h2 className="font-display text-3xl uppercase">
                {data.groups.find((g) => g.id === activeGroup)?.label}
              </h2>
              <p className="mt-1 text-sm text-black/50">{currentItems.length} parámetros en esta sección</p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {currentItems.map((item) => (
              <label key={item.key} className={`block ${item.type === "bool" ? "md:col-span-2" : ""}`}>
                <span className="text-[10px] uppercase tracking-[0.2em] text-black/45">{item.label}</span>
                {item.description && <p className="mt-1 text-xs leading-5 text-black/45">{item.description}</p>}
                {renderField(item)}
              </label>
            ))}
          </div>

          {activeGroup === "email" && (
            <div className="mt-8 rounded-sm border border-amber-100 bg-amber-50/50 p-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-800/70">Probar SMTP</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="email@destino.com"
                  className="min-w-[240px] flex-1 rounded-sm border border-black/10 bg-white px-4 py-3 text-sm"
                />
                <button
                  type="button"
                  onClick={sendTestEmail}
                  className="inline-flex items-center gap-2 border border-black/15 bg-white px-5 py-3 text-xs uppercase tracking-[0.14em] hover:border-accent"
                >
                  <Send size={14} />
                  Enviar prueba
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-8 inline-flex items-center gap-2 bg-ink px-8 py-4 text-xs uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </div>
    </section>
  );
}
