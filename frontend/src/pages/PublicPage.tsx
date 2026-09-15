import { ArrowUpRight, Clock, MapPin, Phone, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ServiceList } from "../components/ServiceList";
import { api } from "../services/api";
import type { Barber, BusinessHour, Service } from "../types/api";
import galleryImg from "../assets/img1.jpeg";
import galleryImg2 from "../assets/img2.jpeg";
import galleryImg3 from "../assets/img3.jpeg";


const galleryImages = [
  galleryImg2,
  galleryImg,
  galleryImg3,
];

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const PAGE_META: Record<string, { eyebrow: string; title: string; description: string }> = {
  "/servicios": {
    eyebrow: "Catálogo",
    title: "Servicios con precisión.",
    description: "Cortes, fades y arreglo de barba con tiempos y precios claros.",
  },
  "/barberos": {
    eyebrow: "Equipo",
    title: "El equipo.",
    description: "Profesionales con estilo propio. Reserva directamente con quien prefieras.",
  },
  "/galeria": {
    eyebrow: "Galería",
    title: "Nuestro trabajo.",
    description: "Detalle, textura y acabados que definen la experiencia Ronal.",
  },
  "/contacto": {
    eyebrow: "Visítanos",
    title: "Ven a visitarnos.",
    description: "Estamos en el centro de Lleida. Reserva online o llámanos.",
  },
};

function formatHours(hours: BusinessHour[]): string[] {
  const byDay = new Map<number, BusinessHour[]>();
  for (const row of hours.filter((h) => h.active)) {
    const list = byDay.get(row.day_of_week) ?? [];
    list.push(row);
    byDay.set(row.day_of_week, list);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a - b)
    .map(([day, rows]) => {
      const ranges = rows.map((r) => `${r.start_time.slice(0, 5)} – ${r.end_time.slice(0, 5)}`).join(" / ");
      return `${DAY_NAMES[day]} · ${ranges}`;
    });
}

export function PublicPage({
  path,
  services,
  barbers,
}: {
  path: string;
  services: Service[];
  barbers: Barber[];
}) {
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const meta = PAGE_META[path] ?? PAGE_META["/contacto"];

  useEffect(() => {
    if (path === "/contacto") {
      api.getHours().then(setHours).catch(() => undefined);
    }
  }, [path]);

  const formattedHours = formatHours(hours);

  return (
    <main className="min-h-screen bg-ink pt-24 text-paper lg:pt-28">
      {/* Page hero */}
      <section className="border-b border-white/10 px-6 pb-16 lg:px-10 lg:pb-20">
        <div className="mx-auto max-w-7xl">
          <Link to="/" className="text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-accent">
            ← Inicio
          </Link>
          <p className="mt-12 text-[10px] uppercase tracking-[0.28em] text-accent">{meta.eyebrow}</p>
          <h1 className="mt-4 max-w-4xl font-display text-6xl uppercase leading-[0.92] sm:text-7xl lg:text-8xl">
            {meta.title}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/55">{meta.description}</p>
        </div>
      </section>

      <section className="px-6 py-16 lg:px-10 lg:py-20">
        <div className="mx-auto max-w-7xl">
          {path === "/servicios" && <ServiceList services={services} />}

          {path === "/barberos" && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {barbers.map((barber) => (
                <Link
                  key={barber.id}
                  to={`/barberos/${barber.id}`}
                  className="group overflow-hidden border border-white/10 bg-white/[0.02] transition-all hover:border-accent/50 hover:bg-white/[0.04]"
                >
                  <div className="aspect-[4/5] overflow-hidden bg-white/5">
                    {barber.image_url ? (
                      <img
                        src={barber.image_url}
                        alt={barber.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center font-display text-7xl uppercase text-white/10">
                        {barber.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="p-6">
                    <h2 className="font-display text-3xl uppercase">{barber.name}</h2>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-accent">{barber.specialties}</p>
                    <p className="mt-4 line-clamp-2 text-sm leading-7 text-white/55">{barber.description}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/40 group-hover:text-accent">
                      Ver perfil <ArrowUpRight size={12} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {path === "/galeria" && (
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
              {galleryImages.map((image, i) => (
                <img
                  key={`${image}-${i}`}
                  src={image}
                  loading="lazy"
                  alt="Trabajo de barbería"
                  className={`mb-4 w-full object-cover ${i === 0 ? "aspect-[3/4]" : i % 2 === 0 ? "aspect-square" : "aspect-[4/5]"}`}
                />
              ))}
            </div>
          )}

          {path === "/contacto" && (
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="space-y-6">
                <div className="flex gap-5 border border-white/10 p-6">
                  <MapPin className="mt-1 shrink-0 text-accent" size={20} />
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Dirección</p>
                    <p className="mt-2 text-lg">Av. de Balmes, 12</p>
                    <p className="text-white/55">25006 Lleida</p>
                    <a
                      href="https://maps.google.com/?q=Av.+de+Balmes+12+Lleida"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-accent"
                    >
                      Cómo llegar <ArrowUpRight size={12} />
                    </a>
                  </div>
                </div>

                <div className="flex gap-5 border border-white/10 p-6">
                  <Phone className="mt-1 shrink-0 text-accent" size={20} />
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Teléfono</p>
                    <a href="tel:+34722410067" className="mt-2 block text-lg transition-colors hover:text-accent">
                      722 41 00 67
                    </a>
                  </div>
                </div>

                <div className="flex gap-5 border border-white/10 p-6">
                  <Share2 className="mt-1 shrink-0 text-accent" size={20} />
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Instagram</p>
                    <a
                      href="https://www.instagram.com/ronal_barber_/"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block text-lg transition-colors hover:text-accent"
                    >
                      @ronal_barber_
                    </a>
                  </div>
                </div>
              </div>

              <div className="border border-white/10 bg-white/[0.02] p-8 lg:p-10">
                <div className="flex items-center gap-3">
                  <Clock className="text-accent" size={20} />
                  <h2 className="font-display text-3xl uppercase">Horarios</h2>
                </div>
                <div className="mt-8 space-y-3">
                  {formattedHours.length > 0 ? (
                    formattedHours.map((line) => (
                      <p key={line} className="border-b border-white/10 pb-3 text-sm text-white/65 last:border-0">
                        {line}
                      </p>
                    ))
                  ) : (
                    <>
                      <p className="border-b border-white/10 pb-3 text-sm text-white/65">Lunes a viernes · 09:00 – 14:00 / 16:00 – 20:00</p>
                      <p className="border-b border-white/10 pb-3 text-sm text-white/65">Sábado · 09:00 – 14:00</p>
                    </>
                  )}
                  <p className="text-sm text-white/40">Domingo · Cerrado</p>
                </div>
                <Link
                  to="/reservar"
                  className="mt-10 inline-flex w-full items-center justify-center gap-2 bg-accent py-4 text-xs uppercase tracking-[0.14em] text-ink"
                >
                  Reservar cita <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
