import { Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import logo from "../assets/logo_ronal.png";

const NAV = [
  { to: "/servicios", label: "Servicios" },
  { to: "/barberos", label: "Barberos" },
  { to: "/galeria", label: "Galería" },
  { to: "/contacto", label: "Contacto" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const close = () => setOpen(false);

  return (
    <header className="fixed z-20 w-full border-b border-white/10 bg-ink/90 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
        <Link to="/" className="flex items-center gap-3" onClick={close}>
          <img src={logo} alt="Ronal Barber" className="h-10 w-10 object-contain" />
          <span className="hidden text-[10px] uppercase tracking-[0.28em] text-white/70 sm:block">
            Ronal Barber
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-[11px] uppercase tracking-[0.16em] text-white/60 md:flex">
          {NAV.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`transition-colors hover:text-accent ${location.pathname === to ? "text-accent" : ""}`}
            >
              {label}
            </Link>
          ))}
          <Link to="/admin/login" className="text-white/35 transition-colors hover:text-white/70">
            Acceso staff
          </Link>
          <Link
            to="/reservar"
            className="bg-accent px-5 py-2.5 font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Reservar
          </Link>
        </nav>

        <button
          className="rounded-sm p-2 text-white/80 transition-colors hover:bg-white/5 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-white/10 bg-ink px-6 py-6 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={close}
                className={`px-2 py-3 text-sm uppercase tracking-[0.16em] ${location.pathname === to ? "text-accent" : "text-white/70"}`}
              >
                {label}
              </Link>
            ))}
            <Link
              to="/reservar"
              onClick={close}
              className="mt-4 bg-accent px-5 py-4 text-center text-sm uppercase tracking-[0.14em] text-ink"
            >
              Reservar cita
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
