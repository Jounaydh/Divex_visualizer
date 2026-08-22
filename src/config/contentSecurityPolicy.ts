const DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "worker-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "media-src 'none'",
  "manifest-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

export function contentSecurityPolicy(development: boolean) {
  const connectSources = development
    ? "'self' http://localhost:5173 ws://localhost:5173"
    : "'self'";
  return [...DIRECTIVES, `connect-src ${connectSources}`].join("; ");
}
