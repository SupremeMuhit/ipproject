/**
 * Basic IP Logger Worker
 * 
 * Logs visitor IP addresses to Cloudflare Workers console.
 * Logs are visible only in the Cloudflare Dashboard.
 * 
 * Deploy: wrangler deploy
 * View logs: Cloudflare Dashboard → Workers & Pages → [Worker Name] → Logs
 */

export default {
  async fetch(request, env, ctx) {
    // Extract real client IP (set by Cloudflare, cannot be spoofed)
    const ip = request.headers.get("CF-Connecting-IP");
    const userAgent = request.headers.get("User-Agent") || "unknown";
    const timestamp = new Date().toISOString();
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // Get Cloudflare request metadata
    const cf = request.cf || {};
    const country = cf.country || "unknown";
    const city = cf.city || "unknown";
    const asn = cf.asn || "unknown";
    
    // Create structured log entry
    const logEntry = {
      timestamp,
      ip,
      method,
      path,
      userAgent,
      country,
      city,
      asn,
      referer: request.headers.get("Referer") || "direct"
    };
    
    // Log to Workers console (owner-only, visible in dashboard)
    console.log(JSON.stringify(logEntry));
    
    // Fetch the website from Pages and return it
    const pagesUrl = `https://fluppy.pages.dev${path}${url.search}`;
    return fetch(pagesUrl);
  }
};
