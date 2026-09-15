import { Link, Outlet } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";

const FOOTER_LINKS = [
  { to: "/servicios", label: "Servicios" },
  { to: "/barberos", label: "Barberos" },
  { to: "/galeria", label: "Galería" },
  { to: "/contacto", label: "Contacto" },
  { to: "/reservar", label: "Reservar" },
];

export function PublicLayout() {
  return (
    <>
      <SiteHeader />
      <Outlet />
      <footer className="border-t border-white/10 bg-ink px-6 py-14 text-paper lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-3xl uppercase">Ronal Barber</p>
            <p className="mt-4 max-w-sm text-sm leading-7 text-white/50">
              Barbería masculina en Lleida. Precisión, carácter y un espacio pensado para tu estilo.
            </p>
            <Link
              to="/reservar"
              className="mt-6 inline-block bg-accent px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-ink"
            >
              Reservar cita
            </Link>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Navegación</p>
            <ul className="mt-5 space-y-3">
              {FOOTER_LINKS.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="text-sm text-white/60 transition-colors hover:text-accent">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Contacto</p>
            <address className="mt-5 space-y-2 text-sm not-italic leading-7 text-white/60">
              <p>Av. de Balmes, 12</p>
              <p>25006 Lleida</p>
              <p>
                <a href="tel:+34722410067" className="transition-colors hover:text-accent">
                  722 41 00 67
                </a>
              </p>
              <p>
                <a
                  href="https://www.instagram.com/ronal_barber_/"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-accent"
                >
                  @ronal_barber_
                </a>
              </p>
            </address>
          </div>
        </div>

        <div className="mx-auto mt-12 flex max-w-7xl flex-col gap-3 border-t border-white/10 pt-8 text-[10px] uppercase tracking-[0.16em] text-white/30 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Ronal Barber</span>
          <span>Estilo masculino · Lleida</span>
        </div>
      </footer>
    </>
  );
}
