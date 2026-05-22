import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("vocab_session")?.value);
  const protectedRoute = pathname.startsWith("/learn") || pathname.startsWith("/settings") || pathname.startsWith("/admin");
  const authRoute = pathname.startsWith("/login") || pathname.startsWith("/register");

  if (protectedRoute && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (authRoute && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/learn";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/learn/:path*", "/settings/:path*", "/admin/:path*", "/login", "/register"]
};
