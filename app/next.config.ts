import type {NextConfig} from "next";

const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.roninchain.com https://api-gateway.skymavis.com https://*.skymavis.com wss://*.roninchain.com",
    "frame-src https://waypoint.skymavis.com https://*.skymavis.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join("; ");

const securityHeaders: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": cspHeader,
};

const nextConfig: NextConfig = {
    reactStrictMode: true,
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: Object.entries(securityHeaders).map(([key, value]) => ({
                    key,
                    value,
                })),
            },
        ];
    },
};

export default nextConfig;