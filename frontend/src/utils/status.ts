export function appointmentStatusLabel(status: string): string {
  if (status === "cancelled") return "Cancelada";
  return "Confirmada";
}
