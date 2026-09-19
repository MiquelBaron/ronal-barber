import { check, group, sleep } from 'k6';
import { getConfig } from './lib/config.js';
import { getJson, checkStatus } from './lib/http.js';
import { login, authGet } from './lib/auth.js';
import { resolveBookingSlot, buildAppointmentPayload, createAppointment } from './lib/booking.js';
import { smokeThresholds } from './lib/thresholds.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: smokeThresholds,
};

export function setup() {
  const config = getConfig();
  const slot = resolveBookingSlot(config.baseUrl, config);
  return { config, slot };
}

export default function (data) {
  const { config, slot } = data;
  const { baseUrl } = config;

  group('public endpoints', () => {
    const health = getJson(`${baseUrl}/api/health`);
    check(health.response, {
      'health ok': (r) => r.status === 200 && health.body?.status === 'ok',
    });

    const services = getJson(`${baseUrl}/api/services`);
    check(services.response, {
      'services list': (r) => r.status === 200 && Array.isArray(services.body) && services.body.length > 0,
    });

    const barbers = getJson(`${baseUrl}/api/barbers`);
    check(barbers.response, {
      'barbers list': (r) => r.status === 200 && Array.isArray(barbers.body) && barbers.body.length > 0,
    });

    const hours = getJson(`${baseUrl}/api/hours`);
    check(hours.response, {
      'business hours': (r) => r.status === 200 && Array.isArray(hours.body),
    });

    const availability = getJson(
      `${baseUrl}/api/availability?service_id=${slot.serviceId}&date=${slot.date}&barber_id=${slot.barberId}`,
    );
    check(availability.response, {
      'availability slots': (r) =>
        r.status === 200 && Array.isArray(availability.body?.slots) && availability.body.slots.length > 0,
    });
  });

  group('auth', () => {
    const adminJar = login(baseUrl, config.adminEmail, config.adminPassword);
    const me = authGet(baseUrl, '/api/auth/me', adminJar);
    check(me, {
      'admin /auth/me': (r) => r.status === 200,
    });

    const appointments = authGet(baseUrl, '/api/admin/appointments', adminJar);
    check(appointments, {
      'admin appointments': (r) => r.status === 200 && Array.isArray(appointments.json()),
    });
  });

  group('booking flow', () => {
    const payload = buildAppointmentPayload({
      serviceId: slot.serviceId,
      barberId: slot.barberId,
      date: slot.date,
      startTime: slot.startTime,
      suffix: `smoke-${Date.now()}`,
    });
    const booking = createAppointment(baseUrl, payload);
    checkStatus(booking.response, 201, 'create appointment');
  });

  sleep(0.1);
}
