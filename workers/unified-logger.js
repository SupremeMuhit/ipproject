/**
 * Unified IP Logger & Viewer
 * 
 * Functions:
 * 1. Logs all requests to Cloudflare KV (IP_LOGS)
 * 2. Provides a hidden /_logs endpoint to view logs
 * 3. Proxies non-log requests to the main site
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. ADMIN: View Logs
    if (url.pathname === "/_logs" && request.method === "GET") {
      return handleLogViewer(request, env);
    }

    // 2. LOGGING logic
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const userAgent = request.headers.get("User-Agent") || "unknown";
    const timestamp = new Date().toISOString();
    const date = timestamp.split("T")[0]; // YYYY-MM-DD
    
    const cf = request.cf || {};
    const country = cf.country || "unknown";
    const city = cf.city || "unknown";
    const region = cf.region || "unknown";
    const isp = cf.asOrganization || "unknown";

    const logEntry = {
      timestamp,
      ip,
      method: request.method,
      path: url.pathname,
      userAgent,
      country,
      city,
      region,
      isp,
      referer: request.headers.get("Referer") || "direct"
    };

    // Log to console (real-time)
    console.log(JSON.stringify(logEntry));

    // Store in KV asynchronously
    if (env.IP_LOGS) {
      ctx.waitUntil(storeLog(env, date, logEntry));
    } else {
      console.warn("KV binding 'IP_LOGS' not found. Logs not stored.");
    }

    // 3. PROXY or RESPONSE
    
    // CORS Headers for external usage
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // If it's a dedicated ping/log endpoint
    if (url.pathname === "/ping") {
       return new Response("Logged", { headers: corsHeaders });
    }

    // Default: Proxy to the main website (Cloudflare Pages usually)
    // Adjust this URL to your actual target if different
    const targetUrl = `https://fluppy.pages.dev${url.pathname}${url.search}`;
    let response = await fetch(targetUrl, request);
    
    // Re-create response to potentially add specific headers if needed
    // (Here we just pass it through mostly)
    response = new Response(response.body, response);
    return response;
  }
};

/**
 * Store log in KV
 */
async function storeLog(env, date, logEntry) {
  try {
    const key = `logs:${date}`;
    // Append to existing logs for the day
    // Note: This is a simple append. For high concurrency, consider D1 or splitting keys.
    const existing = await env.IP_LOGS.get(key, "text");
    const newLine = JSON.stringify(logEntry);
    const updated = existing ? `${existing}\n${newLine}` : newLine;
    
    await env.IP_LOGS.put(key, updated, {
      expirationTtl: 60 * 60 * 24 * 30 // 30 days
    });
  } catch (err) {
    console.error("KV Store Error:", err);
  }
}

/**
 * HTML Log Viewer
 */
async function handleLogViewer(request, env) {
  if (!env.IP_LOGS) {
    return new Response("KV 'IP_LOGS' not configured.", { status: 500 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
  const key = `logs:${date}`;
  
  const logsText = await env.IP_LOGS.get(key, "text");
  
  if (!logsText) {
    return new Response(`No logs found for ${date}`, { headers: { "Content-Type": "text/plain" } });
  }

  // Parse lines
  const entries = logsText.split("\n").map(line => {
    try { return JSON.parse(line); } catch (e) { return null; }
  }).filter(Boolean).reverse(); // Newest first

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IP Logs - ${date}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #111; color: #eee; padding: 20px; }
    h1 { color: #4ade80; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
    th, td { border: 1px solid #333; padding: 10px; text-align: left; }
    th { background: #222; color: #4ade80; }
    tr:nth-child(even) { background: #1a1a1a; }
    tr:hover { background: #2a2a2a; }
    .ip { color: #f87171; font-weight: bold; font-family: monospace; }
    .path { color: #60a5fa; font-family: monospace; }
    .meta { color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Logs for ${date}</h1>
  <p>Total: ${entries.length}</p>
  <form>
    <label>Date: <input type="date" name="date" value="${date}"></label>
    <button type="submit">Go</button>
  </form>
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>IP</th>
        <th>Loc</th>
        <th>Path</th>
        <th>User Agent</th>
      </tr>
    </thead>
    <tbody>
      ${entries.map(e => `
        <tr>
          <td>${e.timestamp.split("T")[1].split(".")[0]}</td>
          <td class="ip">${e.ip}</td>
          <td>${e.country} / ${e.city}</td>
          <td class="path">${e.method} ${e.path}</td>
          <td class="meta" title="${e.userAgent}">${e.userAgent.substring(0, 50)}...</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" }
  });
}
