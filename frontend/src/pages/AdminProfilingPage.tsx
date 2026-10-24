import { Activity, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { ProfilingRun, ProfilingStatus } from "../types/api";

type ViewTab = "cpu" | "sql";

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AdminProfilingPage() {
  const { isAdmin } = useStaff();
  const [status, setStatus] = useState<ProfilingStatus | null>(null);
  const [runs, setRuns] = useState<ProfilingRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProfilingRun | null>(null);
  const [tab, setTab] = useState<ViewTab>("cpu");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [nextStatus, nextRuns] = await Promise.all([api.getProfilingStatus(), api.getProfilingRuns()]);
      setStatus(nextStatus);
      setRuns(nextRuns);
      setSelectedId((current) => {
        if (current && nextRuns.some((run) => run.id === current)) return current;
        return nextRuns[0]?.id ?? null;
      });
    } catch {
      setError("No se pudieron cargar las capturas de profiling.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api
      .getProfilingRunDetail(selectedId)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setError("No se pudo cargar el detalle de la captura.");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const sortedQueries = useMemo(() => {
    const queries = detail?.queries ?? [];
    return [...queries].sort((a, b) => b.duration_ms - a.duration_ms);
  }, [detail]);

  if (!isAdmin) return <Navigate to="/admin" replace />;

  async function remove(id: string) {
    if (!window.confirm("¿Eliminar esta captura?")) return;
    try {
      await api.deleteProfilingRun(id);
      setRuns((current) => current.filter((run) => run.id !== id));
      setSelectedId((current) => (current === id ? null : current));
      await load();
    } catch {
      setError("No se pudo eliminar la captura.");
    }
  }

  async function toggle() {
    try {
      const next = status?.enabled ? await api.stopProfiling() : await api.startProfiling();
      setStatus(next);
      setError("");
      if (!next.enabled) {
        await load();
      }
    } catch {
      setError("No se pudo cambiar el estado de profiling.");
    }
  }

  return (
    <section>
      <StaffPageHeader
        eyebrow="Diagnóstico"
        title="Profiling"
        description="Vista CPU de PyInstrument y listado SQL de cada petición capturada."
      />

      <p className="mb-4 rounded-sm border border-black/10 bg-white/70 px-4 py-3 text-sm text-black/55">
        Con el profiling activo, usa otras pantallas (citas, reservar, servicios…). Esta página no se
        captura. Luego pulsa Refrescar o Detener.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-[10px] uppercase tracking-[0.14em] ${
            status?.enabled
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-black/10 bg-white text-black/50"
          }`}
        >
          <Activity size={12} />
          {status?.enabled ? "Capturando" : "Inactivo"}
        </span>
        <button
          type="button"
          onClick={toggle}
          className="border border-black/15 bg-white px-4 py-2 text-[10px] uppercase tracking-[0.14em] hover:border-accent"
        >
          {status?.enabled ? "Detener" : "Activar"}
        </button>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 border border-black/15 bg-white px-4 py-2 text-[10px] uppercase tracking-[0.14em] hover:border-accent"
        >
          <RefreshCw size={12} />
          Refrescar
        </button>
        <Link
          to="/admin/settings"
          className="text-[10px] uppercase tracking-[0.14em] text-black/45 hover:text-accent"
        >
          ← Ajustes
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="text-sm text-black/50">Cargando…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="max-h-[70vh] overflow-y-auto rounded-sm border border-black/10 bg-white shadow-sm">
            {runs.length === 0 ? (
              <p className="px-5 py-8 text-sm text-black/50">
                Sin capturas. Activa el profiling, usa otra sección del panel o la web, y refresca.
              </p>
            ) : (
              <ul className="divide-y divide-black/10">
                {runs.map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(run.id);
                        setTab("cpu");
                      }}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${
                        selectedId === run.id ? "bg-accent/15" : "hover:bg-black/[0.03]"
                      }`}
                    >
                      <span className="font-mono text-xs">
                        <span className="text-black/45">{run.method}</span> {run.path}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-black/40">
                        {run.duration_ms} ms · {run.sql_count ?? 0} SQL
                        {(run.sql_total_ms ?? 0) > 0 ? ` (${run.sql_total_ms} ms)` : ""} ·{" "}
                        {formatWhen(run.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-sm border border-black/10 bg-white shadow-sm">
            {selectedId ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTab("cpu")}
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] ${
                        tab === "cpu" ? "bg-ink text-paper" : "border border-black/15 text-black/55"
                      }`}
                    >
                      CPU
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("sql")}
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] ${
                        tab === "sql" ? "bg-ink text-paper" : "border border-black/15 text-black/55"
                      }`}
                    >
                      SQL{detail ? ` (${detail.sql_count})` : ""}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(selectedId)}
                    className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-red-800 hover:underline"
                  >
                    <Trash2 size={12} />
                    Eliminar
                  </button>
                </div>

                {tab === "cpu" ? (
                  <iframe
                    key={selectedId}
                    title={`Profile ${selectedId}`}
                    src={api.profilingRunHtmlUrl(selectedId)}
                    className="h-[70vh] w-full border-0"
                  />
                ) : (
                  <div className="max-h-[70vh] overflow-auto p-4">
                    {detailLoading ? (
                      <p className="text-sm text-black/50">Cargando SQL…</p>
                    ) : !detail ? (
                      <p className="text-sm text-black/50">Sin detalle.</p>
                    ) : sortedQueries.length === 0 ? (
                      <p className="text-sm text-black/50">Esta captura no tiene consultas SQL.</p>
                    ) : (
                      <>
                        <p className="mb-4 text-[10px] uppercase tracking-[0.14em] text-black/45">
                          {detail.sql_count} consultas · {detail.sql_total_ms} ms SQL · request{" "}
                          {detail.duration_ms} ms
                        </p>
                        <div className="space-y-3">
                          {sortedQueries.map((query, index) => (
                            <article
                              key={`${selectedId}-sql-${index}`}
                              className="rounded-sm border border-black/10 bg-[#f7f6f3] p-3"
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-[0.12em] text-black/40">
                                  #{index + 1}
                                  {query.owner_key ? ` · ${query.owner_key}` : ""}
                                </span>
                                <span className="font-mono text-xs text-ink">{query.duration_ms} ms</span>
                              </div>
                              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-black/80">
                                {query.statement}
                              </pre>
                              {query.parameters &&
                                query.parameters !== "()" &&
                                query.parameters !== "None" && (
                                  <p className="mt-2 font-mono text-[10px] text-black/45">
                                    params: {query.parameters}
                                  </p>
                                )}
                            </article>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="px-5 py-12 text-sm text-black/50">Selecciona una captura.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
