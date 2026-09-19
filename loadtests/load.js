import { check, group, sleep } from 'k6';
import { getConfig } from './lib/config.js';
import { getJson } from './lib/http.js';
import { login, authGet } from './lib/auth.js';
import { resolveBookingSlot } from './lib/booking.js';
import { loadThresholds } from './lib/thresholds.js';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 25 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: loadThresholds,
};

export function setup() {
  const config = getConfig();
  const slot = resolveBookingSlot(config.baseUrl, config);
  return { config, slot };
}

export default function (data) {
  const { config, slot } = data;
  const { baseUrl } = config;
  const roll = Math.random();

  if (roll < 0.35) {
    group('GET /api/services', () => {
      const { response, body } = getJson(`${baseUrl}/api/services`);
      check(response, {
        'services 200': (r) => r.status === 200,
        'services non-empty': () => Array.isArray(body) && body.length > 0,
      });
    });
  } else if (roll < 0.65) {
    group('GET /api/availability', () => {
      const url =
        `${baseUrl}/api/availability?service_id=${slot.serviceId}` +
        `&date=${slot.date}&barber_id=${slot.barberId}`;
      const { response, body } = getJson(url);
      check(response, {
        'availability 200': (r) => r.status === 200,
        'availability has slots': () => Array.isArray(body?.slots),
      });
    });
  } else if (roll < 0.85) {
    group('GET /api/barbers + /api/hours', () => {
      const barbers = getJson(`${baseUrl}/api/barbers`);
      check(barbers.response, { 'barbers 200': (r) => r.status === 200 });

      const hours = getJson(`${baseUrl}/api/hours`);
      check(hours.response, { 'hours 200': (r) => r.status === 200 });
    });
  } else {
    group('auth session', () => {
      const jar = login(baseUrl, config.barberEmail, config.barberPassword);
      const me = authGet(baseUrl, '/api/auth/me', jar);
      check(me, { 'barber me 200': (r) => r.status === 200 });

      const mine = authGet(baseUrl, '/api/appointments/mine', jar);
      check(mine, { 'appointments/mine 200': (r) => r.status === 200 });
    });
  }

  sleep(Math.random() * 0.5 + 0.1);
}
