import type { Appointment } from "../types/api";

function localDateIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeHHmm(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Today's appointments with start_time after now, excluding cancelled. */
export function upcomingTodayAppointments(appointments: Appointment[], now = new Date()): Appointment[] {
  const today = localDateIso(now);
  const current = localTimeHHmm(now);
  return appointments
    .filter(
      (item) =>
        item.date === today &&
        item.status !== "cancelled" &&
        item.start_time.slice(0, 5) > current,
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}
