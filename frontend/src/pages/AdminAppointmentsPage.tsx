import { useEffect, useState } from "react";
import { ManualAppointmentForm } from "../components/ManualAppointmentForm";
import { StaffPageHeader } from "../components/StaffPageHeader";
import { useStaff } from "../contexts/StaffContext";
import { api } from "../services/api";
import type { AdminAppointment, Barber } from "../types/api";

export function AdminAppointmentsPage() {
  const { isLimitedBarber, user } = useStaff();
  const [items, setItems] = useState<AdminAppointment[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    api.getAdminAppointments().then(setItems).catch(() => setError("No se han podido cargar las citas."));
  }

  useEffect(() => {
    load();
    api.getBarbers().then(setBarbers).catch(() => undefined);
  }, []);

  async function status(id: number, value: string) {
    const updated = await api.updateAppointmentStatus(id, value);
    setItems(items.map((item) => (item.id === id ? { ...item, status: updated.status } : item)));
  }

  return (
    <section>
      <StaffPageHeader
        eyebrow="Operativa"
        title="Citas"
        description="Consulta y gestiona todas las reservas del local."
      />

      <div className="mb-8 flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-sm border border-black/15 bg-white px-5 py-3 text-xs uppercase tracking-[0.14em] shadow-sm hover:border-accent"
        >
          {showForm ? "Ocultar formulario" : "Crear cita"}
        </button>
      </div>

      {showForm && (
        <div className="mb-10 max-w-xl rounded-sm border border-black/10 bg-white p-6 shadow-sm">
          <ManualAppointmentForm
            barbers={barbers}
            defaultBarberId={isLimitedBarber ? user.barber_id ?? undefined : undefined}
            isBarber={isLimitedBarber}
            onCreated={() => {
              load();
              setShowForm(false);
            }}
          />
        </div>
      )}

      {error && <p className="mb-6 text-sm text-red-700">{error}</p>}

      <div className="divide-y divide-black/10 rounded-sm border border-black/10 bg-white shadow-sm">
        {items.map((item) => (
          <article key={item.id} className="grid gap-4 px-6 py-5 md:grid-cols-[150px_1fr_1fr_auto] md:items-center">
            <time className="text-sm font-medium">{item.date} · {item.start_time.slice(0, 5)}</time>
            <div>
              <p>{item.customer_name} {item.customer_surname}</p>
              <p className="text-sm text-black/55">{item.customer_email}</p>
            </div>
            <div>
              <p>{item.service_name}</p>
              <p className="text-sm text-black/55">{item.price} € · {item.payment_status}</p>
            </div>
            <select
              value={item.status}
              onChange={(e) => status(item.id, e.target.value)}
              className="rounded-sm border border-black/15 bg-[#eceae4]/50 px-3 py-2 text-sm"
            >
              <option value="pending">Pendiente</option>
              <option value="confirmed">Confirmada</option>
              <option value="cancelled">Cancelada</option>
              <option value="completed">Completada</option>
            </select>
          </article>
        ))}
      </div>
    </section>
  );
}
