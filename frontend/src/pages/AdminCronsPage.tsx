import { Navigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { CronJob } from "../types/api";

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function scheduleLabel(job: CronJob): string {
  if (job.trigger_type === "cron") {
    const hour = String(job.cron_hour ?? 0).padStart(2, "0");
    const minute = String(job.cron_minute ?? 0).padStart(2, "0");
    const time = `${hour}:${minute}`;
    if (job.cron_day_of_week != null && job.cron_day_of_week >= 0 && job.cron_day_of_week <= 6) {
      return `${WEEKDAY_LABELS[job.cron_day_of_week]} ${time}`;
    }
    return `Diario ${time}`;
  }
  return `Cada ${job.interval_minutes ?? "?"} min`;
}

function statusStyles(status: string): string {
  switch (status) {
    case "ok":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "error":
      return "bg-red-50 text-red-800 border-red-200";
    case "running":
      return "bg-amber-50 text-amber-900 border-amber-200";
    default:
      return "bg-black/5 text-black/55 border-black/10";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "ok":
      return "OK";
    case "error":
      return "Error";
    case "running":
      return "Ejecutando";
    case "never":
      return "Nunca";
    default:
      return status;
  }
}

export function AdminCronsPage() {
  const { isAdmin } = useStaff();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    api
      .getAdminCrons()
      .then(setJobs)
      .catch(() => setError("No se pudieron cargar los crons."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!isAdmin) return <Navigate to="/admin/appointments" replace />;

  async function toggleActive(job: CronJob) {
    setBusyId(job.id);
    setError("");
    try {
      const updated = await api.updateAdminCron(job.id, !job.active);
      setJobs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      setError("No se pudo actualizar el cron.");
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(job: CronJob) {
    setBusyId(job.id);
    setError("");
    try {
      const updated = await api.runAdminCron(job.id);
      setJobs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      setError("No se pudo ejecutar el cron.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <StaffPageHeader
        eyebrow="Sistema"
        title="Acciones planificadas"
        description="Registro de crons del servidor: última ejecución, estado y próxima corrida (estilo Odoo)."
      />

      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={load}
          className="border border-black/15 bg-white px-4 py-2.5 text-xs uppercase tracking-[0.14em] hover:border-accent"
        >
          Actualizar
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.02] text-[10px] uppercase tracking-[0.16em] text-black/45">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Programación</th>
              <th className="px-4 py-3 font-medium">Última ejecución</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Próxima</th>
              <th className="px-4 py-3 font-medium">Activo</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-black/5 align-top">
                <td className="px-4 py-4">
                  <p className="font-medium text-ink">{job.name}</p>
                  <p className="mt-1 text-xs text-black/45">{job.description}</p>
                  <p className="mt-1 font-mono text-[10px] text-black/35">{job.code}</p>
                  {job.last_run_summary && (
                    <p className="mt-2 text-xs text-black/55">{job.last_run_summary}</p>
                  )}
                  {job.last_error && (
                    <p className="mt-1 text-xs text-red-700">{job.last_error}</p>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-black/70">{scheduleLabel(job)}</td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <p>{formatWhen(job.last_run_at)}</p>
                  {job.last_run_duration_ms != null && (
                    <p className="mt-1 text-xs text-black/40">
                      {job.last_run_duration_ms} ms · {job.run_count} ejecuciones
                    </p>
                  )}
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-block border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${statusStyles(job.last_run_status)}`}>
                    {statusLabel(job.last_run_status)}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-black/70">{formatWhen(job.next_run_at)}</td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    disabled={busyId === job.id}
                    onClick={() => toggleActive(job)}
                    className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] ${
                      job.active ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-black/15 text-black/45"
                    }`}
                  >
                    {job.active ? "Sí" : "No"}
                  </button>
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    disabled={busyId === job.id}
                    onClick={() => runNow(job)}
                    className="border border-black/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] hover:border-accent disabled:opacity-40"
                  >
                    Ejecutar
                  </button>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-black/40">
                  No hay crons registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
