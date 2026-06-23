import { NextResponse } from 'next/server'

export async function proxy(request) {
  const sessionCookie = request.cookies.get('better-auth.session_token') || 
                        request.cookies.get('__Secure-better-auth.session_token');

  const isPublicRoute = request.nextUrl.pathname.startsWith('/sign-in') ||
                        request.nextUrl.pathname.startsWith('/api/auth');

  if (!sessionCookie && !isPublicRoute && request.nextUrl.pathname.startsWith('/charts')) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
