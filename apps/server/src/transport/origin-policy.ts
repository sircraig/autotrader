const DEFAULT_ALLOWED_ORIGINS = [
  'http://192.168.20.20:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://192.168.20.20:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
] as const;

export function getDefaultAllowedOrigins(): string[] {
  return [...DEFAULT_ALLOWED_ORIGINS];
}

export function createAllowedOrigins(webOrigin: string | undefined): Set<string> {
  return new Set(
    (webOrigin?.split(',') ?? getDefaultAllowedOrigins())
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
  );
}

export function buildCorsHeaders(request: Request, allowedOrigins: Set<string>): Headers {
  const headers = new Headers({
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  });
  const origin = request.headers.get('origin');

  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return headers;
}

export function isAllowedOrigin(request: Request, allowedOrigins: Set<string>): boolean {
  const origin = request.headers.get('origin');
  return origin === null || allowedOrigins.has(origin);
}
