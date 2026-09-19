export const smokeThresholds = {
  http_req_failed: ['rate<0.01'],
  // Booking triggers email/notifications; allow headroom on dev/staging.
  http_req_duration: ['p(95)<2000', 'p(99)<3000'],
  checks: ['rate>0.99'],
};

export const loadThresholds = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p(95)<1500', 'p(99)<3000'],
  checks: ['rate>0.95'],
};

export function concurrencyThresholds(vus) {
  return {
    'http_req_failed{scenario:concurrent_booking}': ['rate==0'],
    'http_req_duration{scenario:concurrent_booking}': ['p(95)<3000', 'p(99)<5000'],
    booking_success: ['count==1'],
    booking_conflict: [`count==${vus - 1}`],
    booking_other: ['count==0'],
  };
}
