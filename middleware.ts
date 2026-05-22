import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("vocab_session")?.value);
  const protectedRoute = pathname.startsWith("/learn") || pathname.startsWith("/settings") || pathname.startsWith("/admin");
  const authRoute = pathname.startsWith("/login") || pathname.startsWith("/register");

  if (protectedRoute && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (authRoute && hasSession) {
    const url = request.nextUrl.clone();
    const next = url.searchParams.get("next");
    if (next?.startsWith("/")) {
      url.pathname = next.split("?")[0] || "/learn";
      url.search = next.includes("?") ? `?${next.split("?").slice(1).join("?")}` : "";
    } else {
      url.pathname = "/learn";
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/learn/:path*", "/settings/:path*", "/admin/:path*", "/login", "/register"]
};
