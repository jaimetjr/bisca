// Sentry must initialize before everything else (see instrument.ts). Error
// capture itself happens via the logger hook in lib/logger.ts — every
// log.error/log.fatal forwards to Sentry, so no per-route wiring is needed.
import "./lib/instrument";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { registerRoutes } from "./routes";
import { deleteExpiredCodes } from "./lib/auth-codes";
import { logger } from "./lib/logger";
import {
  PRIVACY_HTML,
  TERMS_HTML,
  ACCOUNT_DELETION_HTML,
  APP_ADS_TXT,
} from "./lib/legal-content";
import {
  GOOGLE_VERIFICATION_BODY,
  GOOGLE_VERIFICATION_PATH,
  ROBOTS_TXT,
  landingHtml,
  pickLandingLanguage,
  sitemapXml,
} from "./lib/landing-content";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = logger;
declare module "http" {
    interface IncomingMessage {
        rawBody: unknown;
    }
}

function setupCors(app: express.Application) {
    app.use((req, res, next) => {
        const origins = new Set<string>();
        if (process.env.ALLOWED_ORIGINS) {
            process.env.ALLOWED_ORIGINS.split(",").forEach((d) => {
                origins.add(d.trim());
            });
        }

        const origin = req.header("origin");

        // Allow localhost origins for Expo web development (any port)
        const isLocalhost =
            origin?.startsWith("http://localhost:") ||
            origin?.startsWith("http://127.0.0.1:");

        if (origin && (origins.has(origin) || isLocalhost)) {
            res.header("Access-Control-Allow-Origin", origin);
            res.header(
                "Access-Control-Allow-Methods",
                "GET, POST, PUT, DELETE, OPTIONS",
            );
            res.header("Access-Control-Allow-Headers", "Content-Type");
            res.header("Access-Control-Allow-Credentials", "true");
        }

        if (req.method === "OPTIONS") {
            return res.sendStatus(200);
        }

        next();
    })
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // Only emit one line per request and skip noisy non-API paths.
      autoLogging: {
        ignore: (req) => !(req.url ?? '').startsWith('/api'),
      },
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({ req, res }: { req: Request; res: Response }) {
  const lang = pickLandingLanguage(
    req.header("accept-language"),
    typeof req.query.hl === "string" ? req.query.hl : undefined,
  );

  log.debug({ lang }, "serving landing page");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Language depends on the request header, so shared caches must not serve
  // one visitor's language to another.
  res.setHeader("Vary", "Accept-Language");
  res.status(200).send(landingHtml(lang));
}

function configureExpoAndLanding(app: express.Application) {
  log.info('Serving static Expo files with dynamic manifest routing');

  // Crawler directives. These sit ahead of the `/` handler so they are never
  // shadowed by it, and are generated rather than read from disk for the same
  // reason as the landing page itself.
  app.get("/robots.txt", (_req: Request, res: Response) =>
    res.type("text/plain").send(ROBOTS_TXT()),
  );
  app.get("/sitemap.xml", (_req: Request, res: Response) =>
    res.type("application/xml").send(sitemapXml()),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      return serveLandingPage({ req, res });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log.info('Expo routing: checking expo-platform header on / and /manifest');
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    logger.error({ err }, 'internal server error');

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

function setupLegalPages(app: express.Application) {
  // Public compliance pages required for the Play Store listing + AdMob.
  // Content is bundled (see server/lib/legal-content.ts), so these serve
  // correctly even on deploy images that omit the source tree.
  app.get("/privacy", (_req, res) => res.type("html").send(PRIVACY_HTML));
  app.get("/terms", (_req, res) => res.type("html").send(TERMS_HTML));
  app.get("/account-deletion", (_req, res) =>
    res.type("html").send(ACCOUNT_DELETION_HTML),
  );
  app.get("/app-ads.txt", (_req, res) => res.type("text/plain").send(APP_ADS_TXT));

  // Google Search Console ownership proof. Served from a bundled constant so it
  // survives the runtime image, which ships only server_dist.
  app.get(GOOGLE_VERIFICATION_PATH, (_req, res) =>
    res.type("text/html").send(GOOGLE_VERIFICATION_BODY),
  );
}

(async () => {
  app.use(
    helmet({
      contentSecurityPolicy: false, // Expo landing page uses inline assets; revisit when CSP is hardened
      crossOriginEmbedderPolicy: false,
    }),
  );
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  setupLegalPages(app);
  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  // Periodically purge expired one-time auth codes (email verify / reset).
  // unref() so this timer never keeps the process alive on shutdown.
  const AUTH_CODE_GC_INTERVAL_MS = 60 * 60 * 1000; // hourly
  const authCodeGc = setInterval(() => {
    deleteExpiredCodes()
      .then((removed) => {
        if (removed > 0) log.debug({ removed }, 'purged expired auth codes');
      })
      .catch((err) => log.error({ err }, 'auth code GC failed'));
  }, AUTH_CODE_GC_INTERVAL_MS);
  // unref so this timer never keeps the process alive on shutdown. Cast because
  // the Expo/RN tsconfig surfaces the DOM setInterval (returns number); at
  // runtime under Node the handle is a Timeout with unref().
  (authCodeGc as unknown as { unref?: () => void }).unref?.();

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    log.info({ port }, 'express server listening');
  });
})();
