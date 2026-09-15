export type Service = {
  id: number;
  name: string;
  description: string;
  price: string;
  duration_minutes: number;
  active: boolean;
};

export type Barber = {
  id: number;
  name: string;
  description: string;
  specialties: string;
  image_url: string;
  active: boolean;
};

export type BusinessHour = {
  id?: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
};

export type AppointmentPayload = {
  service_id: number;
  barber_id: number | null;
  date: string;
  start_time: string;
  customer_name: FormDataEntryValue | null;
  customer_surname: FormDataEntryValue | null;
  customer_phone: FormDataEntryValue | null;
  customer_email: FormDataEntryValue | null;
  privacy_accepted: boolean;
};

export type ManualAppointmentPayload = {
  service_id: number;
  barber_id?: number | null;
  date: string;
  start_time: string;
  customer_name: string;
  customer_surname: string;
  customer_phone: string;
  customer_email: string;
  send_customer_email?: boolean;
};

export type Appointment = {
  id: number;
  service_id: number;
  barber_id: number;
  date: string;
  start_time: string;
  end_time: string;
  price: string;
  customer_email: string;
  customer_name: string;
  customer_surname: string;
  customer_phone: string;
  service_name: string;
  status: string;
};

export type AdminAppointment = Appointment & { payment_status: string };

export type AppointmentByToken = {
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  service_name: string;
  barber_name: string | null;
  customer_name: string;
};

export type DayOff = {
  id: number;
  barber_id: number;
  start_date: string;
  end_date: string;
  reason: string;
};

export type TelegramStatus = {
  connected: boolean;
  bot_username: string;
};

export type TelegramLink = {
  link: string;
  expires_in_minutes: number;
};

export type SettingItem = {
  key: string;
  label: string;
  group: string;
  type: string;
  value: string;
  description: string;
  is_secret: boolean;
  has_value: boolean;
  options?: string[] | null;
};

export type SettingsGroup = {
  id: string;
  label: string;
};

export type SettingsResponse = {
  groups: SettingsGroup[];
  items: SettingItem[];
  bootstrap_note: string;
};
