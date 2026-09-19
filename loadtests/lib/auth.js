import http from 'k6/http';
import { check } from 'k6';
import { jsonHeaders } from './http.js';

/** Login via POST /api/auth/login and return the cookie jar with access_token set. */
export function login(baseUrl, email, password) {
  const jar = http.cookieJar();
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: jsonHeaders(), jar },
  );

  check(response, {
    'login status 200': (r) => r.status === 200,
  });

  return jar;
}

export function authGet(baseUrl, path, jar) {
  return http.get(`${baseUrl}${path}`, { jar });
}
