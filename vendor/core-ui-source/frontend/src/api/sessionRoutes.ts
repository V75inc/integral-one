/** Public pages must remain usable independently of retained session state. */
export function isPublicAuthPath(pathname: string): boolean {
  return /^\/(login|signup|forgot-password|reset-password|verify-email|credentials-delivery-verify(?:\.html)?)\/?$/.test(pathname)
    || pathname.startsWith('/invitations/')
    || pathname.startsWith('/portfolio/shared/')
    || pathname.startsWith('/public/tracks/');
}
