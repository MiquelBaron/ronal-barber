import http from 'k6/http';
import { check } from 'k6';

export function jsonHeaders(extra = {}) {
  return { 'Content-Type': 'application/json', ...extra };
}

export function getJson(url, params = {}) {
  const response = http.get(url, params);
  return { response, body: parseJson(response) };
}

export function postJson(url, payload, params = {}) {
  const response = http.post(url, JSON.stringify(payload), {
    ...params,
    headers: jsonHeaders(params.headers),
  });
  return { response, body: parseJson(response) };
}

function parseJson(response) {
  if (!response.body) {
    return null;
  }
  try {
    return response.json();
  } catch (_) {
    return null;
  }
}

export function checkStatus(response, expected, label) {
  return check(response, {
    [`${label} status ${expected}`]: (r) => r.status === expected,
  });
}
