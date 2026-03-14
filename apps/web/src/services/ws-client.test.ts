import { expect, test } from 'bun:test';

import { createServerHttpUrl, createServerWsUrl } from './ws-client';

const baseLocation = {
  protocol: 'http:',
  hostname: '192.168.20.20'
};

test('server urls default to port 3001', () => {
  expect(createServerHttpUrl(baseLocation, {})).toBe('http://192.168.20.20:3001');
  expect(createServerWsUrl(baseLocation, {})).toBe('ws://192.168.20.20:3001/ws');
});

test('server urls respect VITE_SERVER_PORT overrides', () => {
  const env = {
    VITE_SERVER_PORT: '4310'
  };

  expect(createServerHttpUrl(baseLocation, env)).toBe('http://192.168.20.20:4310');
  expect(createServerWsUrl(baseLocation, env)).toBe('ws://192.168.20.20:4310/ws');
});

test('full url overrides take precedence over the shared port override', () => {
  const env = {
    VITE_SERVER_PORT: '4310',
    VITE_SERVER_HTTP_URL: 'https://api.example.test',
    VITE_SERVER_WS_URL: 'wss://stream.example.test/ws'
  };

  expect(createServerHttpUrl(baseLocation, env)).toBe('https://api.example.test');
  expect(createServerWsUrl(baseLocation, env)).toBe('wss://stream.example.test/ws');
});
