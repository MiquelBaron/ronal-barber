import { getJson, postJson } from './http.js';
import { nextWeekday } from './dates.js';

export function buildAppointmentPayload({ serviceId, barberId, date, startTime, suffix }) {
  const token = suffix ?? `${__VU}-${__ITER}-${Date.now()}`;
  return {
    service_id: serviceId,
    barber_id: barberId,
    date,
    start_time: startTime,
    customer_name: 'Load',
    customer_surname: `Test ${token}`,
    customer_phone: '600123456',
    customer_email: `load-${token}@example.com`,
    privacy_accepted: true,
  };
}

export function createAppointment(baseUrl, payload, params = {}) {
  return postJson(`${baseUrl}/api/appointments`, payload, params);
}

function fetchAvailability(baseUrl, serviceId, date, barberId) {
  const query = `service_id=${serviceId}&date=${date}&barber_id=${barberId}`;
  return getJson(`${baseUrl}/api/availability?${query}`);
}

/** Resolve a free slot for load tests (setup only). */
export function resolveBookingSlot(baseUrl, config) {
  const candidateDates = config.bookingDate
    ? [config.bookingDate]
    : Array.from({ length: 21 }, (_, index) => nextWeekday(config.daysAhead + index));

  for (const date of candidateDates) {
    const { response, body } = fetchAvailability(baseUrl, config.serviceId, date, config.barberId);
    if (response.status !== 200 || !body?.slots?.length) {
      continue;
    }

    const startTime =
      config.bookingTime && body.slots.includes(config.bookingTime) ? config.bookingTime : body.slots[0];

    return {
      serviceId: config.serviceId,
      barberId: config.barberId,
      date,
      startTime,
    };
  }

  throw new Error(
    `No availability found for service=${config.serviceId}, barber=${config.barberId}. ` +
      'Start the API with seed data or set BOOKING_DATE / BOOKING_TIME.',
  );
}
