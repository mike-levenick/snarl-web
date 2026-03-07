export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/chat/:path*", "/api/chat/:path*", "/api/conversations/:path*"],
};
