import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createBrotliCompress, createGzip } from "node:zlib";

const rootDir = resolve(process.cwd(), "dist/public");
const indexPath = join(rootDir, "index.html");
const port = Number(process.env.PORT || 4173);
const defaultPublicUrl = "https://anyalpha.up.railway.app";
const defaultImage = "/opengraph.jpg";
const defaultTitle = "AnyAlpha Terminal | Live Crypto Market Intelligence";
const defaultDescription =
  "Search tokens, scan live pairs, track wallets, follow launch activity, and review market signals from one compact AnyAlpha terminal.";
const isProduction = process.env.NODE_ENV === "production";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const compressibleExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
]);

function compressionEncoding(request, extension) {
  if (!compressibleExtensions.has(extension)) return null;

  const accepted = String(request.headers["accept-encoding"] || "").toLowerCase();
  // Fast first byte matters more than maximum compression for the app shell.
  // Brotli's default quality is too expensive for the large wallet/trading chunk.
  if (accepted.includes("gzip")) return "gzip";
  if (accepted.includes("br")) return "br";
  return null;
}

function staticHeaders(request, filePath) {
  const extension = extname(filePath).toLowerCase();
  const encoding = compressionEncoding(request, extension);
  const headers = {
    "content-type": contentTypes[extension] || "application/octet-stream",
    "cache-control": isProduction && extension !== ".html" ? "public, max-age=31536000, immutable" : "no-cache",
  };

  if (compressibleExtensions.has(extension)) {
    headers.vary = "accept-encoding";
  }

  if (encoding) {
    headers["content-encoding"] = encoding;
  }

  return { headers, encoding };
}

function publicBaseUrl(request) {
  const configured =
    process.env.ANYALPHA_PUBLIC_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.RAILWAY_PUBLIC_DOMAIN?.trim();

  if (configured) {
    const normalized = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
    return normalized.replace(/\/+$/, "");
  }

  const host = request.headers["x-forwarded-host"] || request.headers.host;
  const proto = request.headers["x-forwarded-proto"] || "https";
  return host ? `${proto}://${host}`.replace(/\/+$/, "") : defaultPublicUrl;
}

function absoluteUrl(value, request) {
  const raw = value?.trim() || defaultImage;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${publicBaseUrl(request)}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function apiBaseUrl() {
  const configured =
    process.env.VITE_API_BASE_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    process.env.PUBLIC_API_URL?.trim();

  if (!configured) return isProduction ? null : "http://127.0.0.1:3000/api";
  const base = configured.replace(/\/+$/, "");
  return base.endsWith("/api") ? base : `${base}/api`;
}

async function proxyApiRequest(request, response, requestUrl) {
  const base = apiBaseUrl();
  if (!base) return false;

  const targetPath = requestUrl.pathname.replace(/^\/api\/?/, "");
  const targetUrl = `${base}${targetPath ? `/${targetPath}` : ""}${requestUrl.search}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (key === "host" || key === "connection") continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
      continue;
    }
    if (typeof value === "string") headers.set(key, value);
  }

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    init.body = await readRequestBody(request);
  }

  const apiResponse = await fetch(targetUrl, init);
  const responseHeaders = Object.fromEntries(apiResponse.headers.entries());
  delete responseHeaders["content-encoding"];
  delete responseHeaders["transfer-encoding"];
  responseHeaders["cache-control"] = responseHeaders["cache-control"] || "no-store";

  response.writeHead(apiResponse.status, responseHeaders);
  if (request.method === "HEAD") {
    response.end();
    return true;
  }

  const body = Buffer.from(await apiResponse.arrayBuffer());
  response.end(body);
  return true;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    request.on("error", reject);
  });
}

async function fetchTokenDetail(chain, tokenAddress) {
  const base = apiBaseUrl();
  if (!base) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);

  try {
    const response = await fetch(
      `${base}/markets/token/${encodeURIComponent(chain)}/${encodeURIComponent(tokenAddress)}`,
      {
        headers: { accept: "application/json" },
        signal: controller.signal,
      },
    );

    if (!response.ok) return null;
    const detail = await response.json();
    return detail?.token ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function compactCurrency(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (Math.abs(value) < 0.01) return `$${value.toFixed(8)}`;
  return `$${value.toFixed(value >= 1 ? 2 : 6)}`;
}

function pct(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
    : "n/a";
}

function pairLabel(token) {
  return `${token?.symbol || "TOKEN"}/${token?.quoteSymbol || token?.chainLabel || "MARKET"}`;
}

function tokenFallback(chain, tokenAddress, requestUrl, request) {
  const short = tokenAddress.length > 12 ? `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}` : tokenAddress;
  return {
    title: `${short} on AnyAlpha`,
    description: `Live AnyAlpha token page for ${short} on ${chain}. Review market context, liquidity, volume, trades, holders, and signal data.`,
    url: `${publicBaseUrl(request)}${requestUrl.pathname}${requestUrl.search}`,
    image: absoluteUrl(defaultImage, request),
  };
}

function pageMeta(requestUrl, request) {
  const path = requestUrl.pathname.replace(/\/+$/, "") || "/";
  const ref = requestUrl.searchParams.get("ref")?.trim();

  if (ref) {
    return {
      title: "Join AnyAlpha Terminal | Earn Alpha Points",
      description:
        "Join AnyAlpha through a referral link, scan live markets, track wallets, sync Telegram, and earn AnyAlpha Points as you use the terminal.",
      url: `${publicBaseUrl(request)}${requestUrl.pathname}${requestUrl.search}`,
      image: absoluteUrl(defaultImage, request),
    };
  }

  const byPath = {
    "/": {
      title: defaultTitle,
      description: defaultDescription,
    },
    "/points": {
      title: "AnyAlpha Points | Referrals & Rewards",
      description: "Track AnyAlpha Points, referrals, Telegram sync, account rewards, and leaderboard progress.",
    },
    "/referrals": {
      title: "AnyAlpha Referrals | Invite & Earn",
      description: "Share AnyAlpha, invite builders and traders, and earn referral rewards through the Points system.",
    },
    "/leaderboard": {
      title: "AnyAlpha Leaderboard | Rankings",
      description: "View AnyAlpha rankings across points, referrals, and platform activity.",
    },
    "/trenches": {
      title: "AnyAlpha Trenches | Launch Feed",
      description: "Track fresh pairs, bonding-stage launches, and migrated pools from the AnyAlpha launch feed.",
    },
    "/watcher": {
      title: "AnyAlpha Watcher | Wallet Intelligence",
      description: "Follow wallets, monitor trader activity, and receive AnyAlpha alerts from tracked wallet flows.",
    },
    "/twitter-track": {
      title: "AnyAlpha Twitter Track | Social Market Signals",
      description: "Monitor X accounts, token mentions, and narrative movement inside AnyAlpha.",
    },
    "/verify": {
      title: "AnyAlpha Verification | Trust Layer",
      description: "Submit and review verification requests through the AnyAlpha trust layer.",
    },
    "/docs": {
      title: "AnyAlpha Docs | Feature Guide",
      description: "Learn how AnyAlpha markets, Watcher, Verification, Points, Twitter Track, and upcoming tools work.",
    },
  };

  const meta = byPath[path] ?? byPath["/"];
  return {
    ...meta,
    url: `${publicBaseUrl(request)}${requestUrl.pathname}${requestUrl.search}`,
    image: absoluteUrl(defaultImage, request),
  };
}

async function metaForRequest(requestUrl, request) {
  const chain = requestUrl.searchParams.get("chain")?.trim().toLowerCase();
  const tokenAddress = requestUrl.searchParams.get("token")?.trim();

  if (chain && tokenAddress) {
    const token = await fetchTokenDetail(chain, tokenAddress);
    if (!token) return tokenFallback(chain, tokenAddress, requestUrl, request);

    const label = pairLabel(token);
    const price = compactCurrency(token.priceUsd);
    const change = pct(token.priceChange?.h24);
    const marketCap = compactCurrency(token.marketCap ?? token.fdv);
    const volume = compactCurrency(token.volume?.h24);

    return {
      title: `${label} on AnyAlpha | ${price}`,
      description: `${token.name || token.symbol} live token page. 24h ${change}, market cap ${marketCap}, volume ${volume}, chain ${token.chainLabel || chain}.`,
      url: `${publicBaseUrl(request)}/?chain=${encodeURIComponent(chain)}&token=${encodeURIComponent(tokenAddress)}`,
      image: absoluteUrl(token.openGraph || token.imageUrl || defaultImage, request),
    };
  }

  return pageMeta(requestUrl, request);
}

function replaceMeta(html, meta) {
  const tags = {
    title: meta.title || defaultTitle,
    description: meta.description || defaultDescription,
    url: meta.url,
    image: meta.image,
  };

  return html
    .replace(/<title>.*?<\/title>/i, `<title>${htmlEscape(tags.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/i, `<meta name="description" content="${htmlEscape(tags.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/i, `<link rel="canonical" href="${htmlEscape(tags.url)}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/i, `<meta property="og:title" content="${htmlEscape(tags.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/i, `<meta property="og:description" content="${htmlEscape(tags.description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/i, `<meta property="og:url" content="${htmlEscape(tags.url)}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/i, `<meta property="og:image" content="${htmlEscape(tags.image)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/i, `<meta name="twitter:title" content="${htmlEscape(tags.title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/i, `<meta name="twitter:description" content="${htmlEscape(tags.description)}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*" \/>/i, `<meta name="twitter:image" content="${htmlEscape(tags.image)}" />`);
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const resolved = resolve(rootDir, `.${normalized}`);

  return resolved.startsWith(rootDir) ? resolved : null;
}

function serveStatic(request, response, filePath) {
  const { headers, encoding } = staticHeaders(request, filePath);
  response.writeHead(200, headers);

  const stream = createReadStream(filePath);
  if (encoding === "br") {
    stream.pipe(createBrotliCompress()).pipe(response);
    return;
  }

  if (encoding === "gzip") {
    stream.pipe(createGzip()).pipe(response);
    return;
  }

  stream.pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      response.writeHead(405).end();
      return;
    }

    const requestUrl = new URL(request.url, publicBaseUrl(request));

    if (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/")) {
      if (await proxyApiRequest(request, response, requestUrl)) return;

      response
        .writeHead(502, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        })
        .end(JSON.stringify({ error: "API proxy is not configured." }));
      return;
    }

    if (!["GET", "HEAD"].includes(request.method || "GET")) {
      response.writeHead(405).end();
      return;
    }

    const staticPath = safeStaticPath(requestUrl.pathname);

    if (staticPath && existsSync(staticPath) && extname(staticPath)) {
      if (request.method === "HEAD") {
        response.writeHead(200, staticHeaders(request, staticPath).headers).end();
        return;
      }

      serveStatic(request, response, staticPath);
      return;
    }

    const [html, meta] = await Promise.all([
      readFile(indexPath, "utf8"),
      metaForRequest(requestUrl, request),
    ]);
    const body = replaceMeta(html, meta);

    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(body);
  } catch (error) {
    console.error("web server request failed", error);
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Internal Server Error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AnyAlpha web server listening on ${port}`);
});
