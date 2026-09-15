import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";
import type { AppointmentByToken } from "../types/api";

export function CancelAppointmentPage() {
  const { token } = useParams<{ token: string }>();
  const [appointment, setAppointment] = useState<AppointmentByToken | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .getAppointmentByToken(token)
      .then(setAppointment)
      .catch(() => setError("No hemos encontrado esta cita."))
      .finally(() => setLoading(false));
  }, [token]);

  async function cancel() {
    if (!token) return;
    try {
      await api.cancelAppointment(token);
      setCancelled(true);
    } catch {
      setError("No se ha podido cancelar la cita. Puede que ya esté cancelada o el enlace haya expirado.");
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
        <p>Cargando...</p>
      </main>
    );
  }

  if (cancelled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
        <div className="max-w-md text-center">
          <h1 className="font-display text-5xl uppercase">Cita cancelada</h1>
          <p className="mt-6 text-black/60">Hemos enviado un correo de confirmación. Esperamos verte pronto.</p>
          <Link to="/" className="mt-10 inline-block border border-black/25 px-6 py-3 text-xs uppercase tracking-[0.15em]">
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  if (error || !appointment) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
        <div className="max-w-md text-center">
          <h1 className="font-display text-5xl uppercase">Error</h1>
          <p className="mt-6 text-red-700">{error || "Cita no encontrada."}</p>
          <Link to="/" className="mt-10 inline-block border border-black/25 px-6 py-3 text-xs uppercase tracking-[0.15em]">
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  if (appointment.status === "cancelled") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
        <div className="max-w-md text-center">
          <h1 className="font-display text-5xl uppercase">Ya cancelada</h1>
          <p className="mt-6 text-black/60">Esta cita ya fue cancelada anteriormente.</p>
          <Link to="/" className="mt-10 inline-block border border-black/25 px-6 py-3 text-xs uppercase tracking-[0.15em]">
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-12 text-ink">
      <div className="w-full max-w-lg border border-black/15 p-8">
        <Link to="/" className="text-xs uppercase tracking-[0.25em] text-black/50">
          Ronal Barber
        </Link>
        <h1 className="mt-6 font-display text-5xl uppercase">Cancelar cita</h1>
        <p className="mt-4 text-black/60">Hola {appointment.customer_name}, ¿confirmas que quieres cancelar?</p>
        <dl className="mt-8 space-y-3 text-sm">
          <div className="flex justify-between border-b border-black/10 pb-2">
            <dt className="text-black/50">Servicio</dt>
            <dd>{appointment.service_name}</dd>
          </div>
          <div className="flex justify-between border-b border-black/10 pb-2">
            <dt className="text-black/50">Barbero</dt>
            <dd>{appointment.barber_name ?? "—"}</dd>
          </div>
          <div className="flex justify-between border-b border-black/10 pb-2">
            <dt className="text-black/50">Fecha</dt>
            <dd>{appointment.date}</dd>
          </div>
          <div className="flex justify-between border-b border-black/10 pb-2">
            <dt className="text-black/50">Hora</dt>
            <dd>{appointment.start_time.slice(0, 5)}</dd>
          </div>
        </dl>
        <div className="mt-10 flex flex-wrap gap-4">
          <button
            onClick={cancel}
            className="bg-red-700 px-6 py-3 text-xs uppercase tracking-[0.15em] text-white"
          >
            Confirmar cancelación
          </button>
          <Link to="/" className="border border-black/25 px-6 py-3 text-xs uppercase tracking-[0.15em]">
            Mantener cita
          </Link>
        </div>
      </div>
    </main>
  );
}
