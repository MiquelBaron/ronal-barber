import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center bg-ink px-6 text-paper lg:px-10">
      <div className="mx-auto w-full max-w-7xl">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">
          Error 404
        </p>
        <h1 className="mt-5 max-w-3xl font-display text-8xl uppercase leading-none sm:text-[11rem]">
          Página no encontrada.
        </h1>
        <p className="mt-8 max-w-md text-lg text-white/60">
          La dirección que buscas no existe o ha cambiado.
        </p>
        <Link
          to="/"
          className="mt-10 inline-block bg-accent px-6 py-4 text-sm uppercase tracking-[0.14em] text-ink"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
