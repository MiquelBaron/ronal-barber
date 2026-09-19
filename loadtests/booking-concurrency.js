import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { getConfig } from './lib/config.js';
import { buildAppointmentPayload, createAppointment, resolveBookingSlot } from './lib/booking.js';
import { concurrencyThresholds } from './lib/thresholds.js';

const concurrentVus = Number(__ENV.CONCURRENT_VUS || 50);
const bookingStatuses = http.expectedStatuses(201, 409);

export const bookingSuccess = new Counter('booking_success');
export const bookingConflict = new Counter('booking_conflict');
export const bookingOther = new Counter('booking_other');

export const options = {
  scenarios: {
    concurrent_booking: {
      executor: 'shared-iterations',
      vus: concurrentVus,
      iterations: concurrentVus,
      maxDuration: '30s',
    },
  },
  thresholds: concurrencyThresholds(concurrentVus),
};

export function setup() {
  const config = getConfig();
  const slot = resolveBookingSlot(config.baseUrl, config);
  return { config, slot };
}

export default function (data) {
  const { config, slot } = data;
  const payload = buildAppointmentPayload({
    serviceId: slot.serviceId,
    barberId: slot.barberId,
    date: slot.date,
    startTime: slot.startTime,
    suffix: `race-${__VU}-${__ITER}`,
  });

  const { response, body } = createAppointment(config.baseUrl, payload, {
    responseCallback: bookingStatuses,
  });

  if (response.status === 201) {
    bookingSuccess.add(1);
    check(response, {
      'booking created': () => body?.id > 0,
    });
  } else if (response.status === 409) {
    bookingConflict.add(1);
    check(response, {
      'slot conflict message': () => body?.detail === 'Appointment slot is no longer available',
    });
  } else {
    bookingOther.add(1);
    check(response, {
      'unexpected booking status': () => false,
    });
  }
}

export function handleSummary(data) {
  const success = data.metrics.booking_success?.values?.count ?? 0;
  const conflict = data.metrics.booking_conflict?.values?.count ?? 0;
  const other = data.metrics.booking_other?.values?.count ?? 0;

  return {
    stdout: [
      '',
      '=== Booking concurrency summary ===',
      `Expected: 1 success, ${concurrentVus - 1} conflicts`,
      `Actual:   ${success} success, ${conflict} conflicts, ${other} other`,
      success === 1 && conflict === concurrentVus - 1 && other === 0
        ? 'PASS: race condition handled correctly'
        : 'FAIL: unexpected booking outcome distribution',
      '',
    ].join('\n'),
  };
}
