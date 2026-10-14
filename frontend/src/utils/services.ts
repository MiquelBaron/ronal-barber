import type { Service } from "../types/api";

const DEFAULT_SERVICE_NAME = "corte clasico";

function normalizeServiceName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Prefer "Corte clásico"; fall back to first active service. */
export function defaultServiceId(services: Service[]): string {
  const active = services.filter((item) => item.active !== false);
  const list = active.length > 0 ? active : services;
  const classic = list.find((item) => normalizeServiceName(item.name) === DEFAULT_SERVICE_NAME);
  return classic ? String(classic.id) : list[0] ? String(list[0].id) : "";
}
