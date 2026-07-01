import express from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { registerRoutes } from "./routes";
import { deleteExpiredCodes } from "./lib/auth-codes";
import { logger } from "./lib/logger";
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

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
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

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log.debug({ baseUrl, expsUrl }, 'serving landing page');

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log.info('Serving static Expo files with dynamic manifest routing');

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
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
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
