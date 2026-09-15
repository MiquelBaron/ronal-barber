export function formatPrice(value: string | number): string {
  return `${Number(value).toFixed(2)} €`;
}

export function formatDuration(minutes: number): string {
  return `${minutes} min`;
}
