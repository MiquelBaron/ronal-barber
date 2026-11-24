import type { Service } from "../types/api";

const DEFAULT_SERVICE_NAME = "corte clasico";

function normalizeServiceName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function independentServices(services: Service[]): Service[] {
  return services.filter((item) => item.active !== false && item.is_independent !== false);
}

export function complementOptions(services: Service[], independentId: string | number | null): Service[] {
  const excluded = Number(independentId);
  return services.filter(
    (item) => item.active !== false && item.is_complement && item.id !== excluded,
  );
}

/** Prefer "Corte clásico"; fall back to first independent service. */
export function defaultServiceId(services: Service[]): string {
  const list = independentServices(services);
  const fallback = list.length > 0 ? list : services.filter((item) => item.active !== false);
  const pool = fallback.length > 0 ? fallback : services;
  const classic = pool.find((item) => normalizeServiceName(item.name) === DEFAULT_SERVICE_NAME);
  return classic ? String(classic.id) : pool[0] ? String(pool[0].id) : "";
}
