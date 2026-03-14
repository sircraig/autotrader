import { expect, test } from 'bun:test';

import {
  buildCorsHeaders,
  createAllowedOrigins,
  getDefaultAllowedOrigins,
  isAllowedOrigin
} from './origin-policy';

test('default allowed origins include Vite dev defaults', () => {
  expect(getDefaultAllowedOrigins()).toContain('http://localhost:5173');
  expect(getDefaultAllowedOrigins()).toContain('http://127.0.0.1:5173');
});

test('createAllowedOrigins parses WEB_ORIGIN lists and trims entries', () => {
  const allowedOrigins = createAllowedOrigins(
    ' http://localhost:3000 , http://localhost:5173 '
  );

  expect(allowedOrigins.has('http://localhost:3000')).toBe(true);
  expect(allowedOrigins.has('http://localhost:5173')).toBe(true);
});

test('cors helpers only allow configured origins', () => {
  const allowedOrigins = createAllowedOrigins(undefined);
  const allowedRequest = new Request('http://localhost:3001/ws', {
    headers: {
      origin: 'http://localhost:5173'
    }
  });
  const deniedRequest = new Request('http://localhost:3001/ws', {
    headers: {
      origin: 'http://evil.example'
    }
  });

  expect(isAllowedOrigin(allowedRequest, allowedOrigins)).toBe(true);
  expect(isAllowedOrigin(deniedRequest, allowedOrigins)).toBe(false);
  expect(buildCorsHeaders(allowedRequest, allowedOrigins).get('Access-Control-Allow-Origin')).toBe(
    'http://localhost:5173'
  );
  expect(buildCorsHeaders(deniedRequest, allowedOrigins).get('Access-Control-Allow-Origin')).toBeNull();
});
