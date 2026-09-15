import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";
import type { Barber } from "../types/api";

export function BarberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [barber, setBarber] = useState<Barber | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .getBarber(Number(id))
      .then(setBarber)
      .catch(() => setError("Barbero no encontrado."));
  }, [id]);

  if (error) {
    return (
      <main className="min-h-screen bg-ink px-6 py-24 text-paper lg:px-10">
        <p>{error}</p>
        <Link to="/barberos" className="mt-6 inline-block text-accent">
          ← Volver al equipo
        </Link>
      </main>
    );
  }

  if (!barber) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink text-paper">
        <div className="h-8 w-8 animate-pulse rounded-full border-2 border-accent border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink pt-24 text-paper lg:pt-28">
      <div className="mx-auto max-w-6xl px-6 pb-20 lg:px-10">
        <Link to="/barberos" className="text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-accent">
          ← El equipo
        </Link>

        <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="overflow-hidden border border-white/10">
            {barber.image_url ? (
              <img src={barber.image_url} alt={barber.name} className="aspect-[4/5] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center bg-white/5 font-display text-8xl uppercase text-white/10">
                {barber.name.slice(0, 1)}
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center">
            <p className="text-[10px] uppercase tracking-[0.28em] text-accent">Barbero</p>
            <h1 className="mt-4 font-display text-6xl uppercase leading-none sm:text-7xl">{barber.name}</h1>
            <p className="mt-5 text-sm uppercase tracking-[0.14em] text-accent">{barber.specialties}</p>
            <p className="mt-8 max-w-md text-lg leading-8 text-white/60">{barber.description}</p>
            <Link
              to={`/reservar?barber=${barber.id}`}
              className="mt-12 inline-flex w-fit items-center gap-3 bg-accent px-8 py-4 text-xs uppercase tracking-[0.16em] text-ink transition-opacity hover:opacity-90"
            >
              Reservar con {barber.name.split(" ")[0]} <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
