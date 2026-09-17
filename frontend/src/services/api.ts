import type {
  Appointment,
  AppointmentByToken,
  AppointmentPayload,
  Barber,
  Service,
  AdminAppointment,
  BusinessHour,
  DayOff,
  ManualAppointmentPayload,
  TelegramLink,
  TelegramStatus,
  SettingsResponse,
} from "../types/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  getServices: (includeInactive = false) => request<Service[]>(`/api/services?include_inactive=${includeInactive}`),
  getService: (id: number) => request<Service>(`/api/services/${id}`),
  createService: (body: { name: string; description: string; price: number; duration_minutes: number; active: boolean }) => request<Service>("/api/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  updateService: (id: number, body: { name: string; description: string; price: number; duration_minutes: number; active: boolean }) => request<Service>(`/api/services/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  deleteService: (id: number) => request<void>(`/api/services/${id}`, { method: "DELETE" }),
  getBarbers: (includeInactive = false) => request<Barber[]>(`/api/barbers?include_inactive=${includeInactive}`),
  getBarber: (id: number) => request<Barber>(`/api/barbers/${id}`),
  createBarber: (body: Pick<Barber, "name" | "description" | "specialties" | "active">) =>
    request<Barber>("/api/barbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  updateBarber: (id: number, body: Pick<Barber, "name" | "description" | "specialties" | "active">) =>
    request<Barber>(`/api/barbers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  uploadBarberPhoto: (id: number, file: File) => {
    const form = new FormData();
    form.append("photo", file);
    return request<Barber>(`/api/barbers/${id}/photo`, { method: "POST", body: form });
  },
  deleteBarberPhoto: (id: number) => request<Barber>(`/api/barbers/${id}/photo`, { method: "DELETE" }),
  deleteBarber: (id: number) => request<void>(`/api/barbers/${id}`, { method: "DELETE" }),
  getHours: () => request<BusinessHour[]>("/api/hours"),
  replaceHours: (body: BusinessHour[]) => request<BusinessHour[]>("/api/hours", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  getAvailability: (serviceId: number, date: string, barberId?: number) => {
    const query = new URLSearchParams({ service_id: String(serviceId), date });
    if (barberId) query.set("barber_id", String(barberId));
    return request<{ slots: string[] }>(`/api/availability?${query}`);
  },
  login: (email: string, password: string) =>
    request<{ id: number; email: string; role: string }>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ id: number; email: string; role: string; barber_name: string; barber_id?: number | null }>("/api/auth/me"),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  getUsers: () => request<{ id: number; email: string; role: string; barber_id?: number | null }[]>("/api/admin/users"),
  getMyAppointments: () => request<Appointment[]>("/api/appointments/mine"),
  getAdminAppointments: () => request<AdminAppointment[]>("/api/admin/appointments"),
  updateAppointmentStatus: (id: number, value: string) => request<Appointment>(`/api/admin/appointments/${id}/status?new_status=${value}`, { method: "PATCH" }),
  createUser: (payload: { email: string; password: string; role: string; barber_id?: number | null }) =>
    request<{ id: number; email: string; role: string }>("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteUser: (id: number) => request<void>(`/api/admin/users/${id}`, { method: "DELETE" }),
  createAppointment: (payload: AppointmentPayload) =>
    request<Appointment>("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  createManualAppointment: (payload: ManualAppointmentPayload) =>
    request<Appointment>("/api/appointments/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  getAppointmentByToken: (token: string) => request<AppointmentByToken>(`/api/appointments/by-token/${token}`),
  cancelAppointment: (token: string) =>
    request<Appointment>("/api/appointments/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }),
  getDaysOff: (barberId?: number) => {
    const query = barberId ? `?barber_id=${barberId}` : "";
    return request<DayOff[]>(`/api/days-off${query}`);
  },
  createDayOff: (body: { barber_id: number; start_date: string; end_date: string; reason: string }) =>
    request<DayOff>("/api/days-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  createMyDayOff: (body: { start_date: string; end_date: string; reason: string }) =>
    request<DayOff>("/api/days-off/mine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  deleteDayOff: (id: number) => request<void>(`/api/days-off/${id}`, { method: "DELETE" }),
  deleteMyDayOff: (id: number) => request<void>(`/api/days-off/mine/${id}`, { method: "DELETE" }),
  getTelegramStatus: () => request<TelegramStatus>("/api/barber/telegram/status"),
  generateTelegramLink: () => request<TelegramLink>("/api/barber/telegram/link", { method: "POST" }),
  getAdminSettings: () => request<SettingsResponse>("/api/admin/settings"),
  updateAdminSettings: (settings: Record<string, string>) =>
    request<SettingsResponse>("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    }),
  testAdminEmail: (to: string) =>
    request<{ status: string; message: string }>("/api/admin/settings/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    }),
};
