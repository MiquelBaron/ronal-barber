/** Shared k6 configuration from environment variables. */
export function getConfig() {
  return {
    baseUrl: (__ENV.API_BASE_URL || 'http://localhost:8000').replace(/\/$/, ''),
    adminEmail: __ENV.ADMIN_EMAIL || 'admin@ronalbarber.com',
    adminPassword: __ENV.ADMIN_PASSWORD || 'admin',
    barberEmail: __ENV.BARBER_EMAIL || 'barber1@ronalbarber.com',
    barberPassword: __ENV.BARBER_PASSWORD || 'barber1',
    serviceId: Number(__ENV.SERVICE_ID || 1),
    barberId: Number(__ENV.BARBER_ID || 1),
    bookingDate: __ENV.BOOKING_DATE || '',
    bookingTime: __ENV.BOOKING_TIME || '10:00',
    daysAhead: Number(__ENV.BOOKING_DAYS_AHEAD || 14),
  };
}
