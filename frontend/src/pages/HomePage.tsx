import { ArrowUpRight, MapPin, Scissors } from "lucide-react";
import { Link } from "react-router-dom";
import { ServiceList } from "../components/ServiceList";
import type { Barber, Service } from "../types/api";
import fondo from "../assets/logo_ronal_facade.jpeg";
import galleryImg from "../assets/img1.jpeg";

const QUICK_LINKS = [
  { to: "/servicios", label: "Servicios", hint: "Catálogo y precios", icon: Scissors },
  { to: "/contacto", label: "Contacto", hint: "Horarios y ubicación", icon: MapPin },
];

export function HomePage({
  services,
  barbers,
  apiOnline,
}: {
  services: Service[];
  barbers: Barber[];
  apiOnline: boolean;
}) {
  return (
    <main className="min-h-screen bg-ink text-paper">
      {/* Hero */}
      <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-6 py-28 sm:px-8 lg:px-12">
        <div className="absolute inset-0 z-0">
          <img
            src={fondo}
            alt="Fachada Ronal Barber"
            className="h-full w-full scale-105 object-cover object-center brightness-[0.45] contrast-[1.08] saturate-[0.85] lg:translate-x-[18%] lg:scale-105 lg:object-right lg:brightness-[0.55]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/55 to-ink sm:hidden" />
          <div className="absolute inset-0 hidden bg-gradient-to-r from-ink via-ink/80 via-50% to-ink/50 sm:block" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(17,17,17,0.15)_0%,rgba(17,17,17,0.55)_48%,rgba(17,17,17,0.88)_100%)]" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-3xl text-center">
          <p className="hero-reveal hero-reveal-delay-1 mb-5 text-[10px] uppercase tracking-[0.3em] text-accent sm:mb-6 sm:tracking-[0.34em]">
            Barbería masculina · Lleida
            <span className={`ml-2 sm:ml-3 ${apiOnline ? "text-white/40" : "text-white/20"}`}>
              · {apiOnline ? "Reservas online" : "Sin conexión"}
            </span>
          </p>
          <h1 className="hero-reveal hero-reveal-delay-2 font-display text-[clamp(2.75rem,9vw,5.75rem)] uppercase leading-[0.92] tracking-tight text-paper drop-shadow-[0_2px_24px_rgba(0,0,0,0.55)]">
            Tu estilo.
            <br />
            Tu identidad.
          </h1>
          <p className="hero-reveal hero-reveal-delay-3 mx-auto mt-6 text-sm leading-7 text-white/75 sm:mt-7 sm:text-base sm:leading-8">
            Más que una barbería, somos tu punto de confianza
          </p>
          <div className="hero-reveal hero-reveal-delay-4 mt-9 flex flex-col items-center justify-center gap-3 sm:mt-10 sm:flex-row sm:gap-4">
            <Link
              to="/reservar"
              className="inline-flex items-center justify-center gap-3 bg-accent px-7 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-ink transition-opacity hover:opacity-90"
            >
              Reservar cita <ArrowUpRight size={16} />
            </Link>
            <Link
              to="/servicios"
              className="inline-flex items-center justify-center gap-3 border border-white/30 px-7 py-4 text-xs uppercase tracking-[0.16em] text-white/90 transition-colors hover:border-accent hover:text-accent"
            >
              Ver servicios
            </Link>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="border-y border-white/10 bg-ink">
        <div className="mx-auto grid max-w-7xl md:grid-cols-2">
          {QUICK_LINKS.map(({ to, label, hint, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-5 border-b border-white/10 px-6 py-8 transition-colors hover:bg-white/[0.03] md:border-b-0 md:border-r md:last:border-r-0 lg:px-10 lg:py-10"
            >
              <span className="rounded-sm border border-accent/30 bg-accent/10 p-3 text-accent">
                <Icon size={18} />
              </span>
              <div>
                <p className="font-display text-2xl uppercase">{label}</p>
                <p className="mt-1 text-xs text-white/45">{hint}</p>
              </div>
              <ArrowUpRight size={16} className="ml-auto text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          ))}
        </div>
      </section>

      {/* Concept */}
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-24 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16 lg:px-10 lg:py-32">
        <p className="text-[10px] uppercase tracking-[0.28em] text-accent">01 / El concepto</p>
        <div>
          <h2 className="font-display text-5xl uppercase leading-none sm:text-6xl lg:text-7xl">
            Más que un corte.
          </h2>
          <p className="mt-8 max-w-xl text-lg leading-8 text-white/55">
            Un buen corte no solo cambia cómo te ves. También cómo te sientes. Atención sin prisas y un acabado que se nota.
          </p>
        </div>
      </section>

      {/* Team preview */}
      {barbers.length > 0 && (
        <section className="border-t border-white/10 px-6 py-24 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-accent">02 / El equipo</p>
              <h2 className="mt-4 font-display text-5xl uppercase leading-none sm:text-6xl">Profesionales.</h2>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {barbers.slice(0, 7).map((barber) => (
                <article
                  key={barber.id}
                  className="overflow-hidden border border-white/10 bg-white/[0.02]"
                >
                  <div className="aspect-[5/4] overflow-hidden bg-white/5">
                    {barber.image_url ? (
                      <img
                        src={barber.image_url}
                        alt={barber.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center font-display text-5xl uppercase text-white/10">
                        {barber.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="p-6">
                    <h3 className="font-display text-2xl uppercase">{barber.name}</h3>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-accent">{barber.specialties}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Services */}
      <section className="bg-paper px-6 py-24 text-ink lg:px-10 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <p className="text-[10px] uppercase tracking-[0.28em] text-black/45">03 / Servicios</p>
          <h2 className="mt-4 font-display text-5xl uppercase leading-none sm:text-6xl lg:text-7xl">
            Servicios con precisión.
          </h2>
          <div className="mt-14">
            <ServiceList services={services} variant="light" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden px-6 py-24 lg:px-10 lg:py-32">
        <div className="absolute inset-0">
          <img src={galleryImg} alt="" className="h-full w-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-ink/80" />
        </div>
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent">Reserva online</p>
          <h2 className="mt-5 font-display text-5xl uppercase leading-none sm:text-6xl">
            ¿Listo para tu próximo corte?
          </h2>
          <p className="mx-auto mt-6 text-white/55">
            Elige servicio, barbero y hora. Confirmación instantánea por email.
          </p>
          <Link
            to="/reservar"
            className="mt-10 inline-flex items-center gap-3 bg-accent px-8 py-4 text-xs uppercase tracking-[0.16em] text-ink"
          >
            Reservar ahora <ArrowUpRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}
