import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Service } from "../types/api";

type Props = {
  services: Service[];
  variant?: "dark" | "light";
};

export function ServiceList({ services, variant = "dark" }: Props) {
  const isDark = variant === "dark";
  const border = isDark ? "divide-white/15 border-white/15" : "divide-black/10 border-black/10";
  const desc = isDark ? "text-white/60" : "text-black/55";
  const meta = isDark ? "text-white/45" : "text-black/40";

  if (!services.length) {
    return <p className={`py-8 ${meta}`}>No hay servicios disponibles.</p>;
  }

  return (
    <div className={`divide-y border-t ${border}`}>
      {services.map((service) => (
        <article
          key={service.id}
          className="group grid gap-5 py-8 transition-colors md:grid-cols-[1.2fr_1.8fr_auto] md:items-center lg:grid-cols-[1fr_2fr_auto_auto] lg:gap-8"
        >
          <div>
            <h2 className="font-display text-3xl uppercase leading-none lg:text-4xl">{service.name}</h2>
            <p className={`mt-2 text-xs uppercase tracking-[0.16em] ${meta}`}>
              {service.duration_minutes} min
            </p>
          </div>
          <p className={`max-w-lg text-sm leading-7 ${desc}`}>{service.description}</p>
          <span className={`font-display text-3xl ${isDark ? "text-accent" : "text-ink"}`}>
            {service.price} €
          </span>
          <Link
            to={`/reservar?service=${service.id}`}
            className="inline-flex items-center justify-center gap-2 self-start bg-accent px-5 py-3.5 text-xs uppercase tracking-[0.14em] text-ink transition-opacity hover:opacity-90 md:self-center"
          >
            Reservar <ArrowUpRight size={14} />
          </Link>
        </article>
      ))}
    </div>
  );
}
