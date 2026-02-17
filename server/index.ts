// node dist/index.js - to run
import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Configure PostgreSQL session store
const PgSession = connectPgSimple(session);

// Configure session middleware with PostgreSQL store
app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: 'sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || "quantum-mail-secret-key-super-secure-2024",
  resave: false,
  saveUninitialized: false,
  name: "qumail.sid", // Custom session name
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax' // Better security
  }
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Redact sensitive content from logs
        const redactedResponse = { ...capturedJsonResponse };
        if (redactedResponse.body) redactedResponse.body = "[REDACTED]";
        if (redactedResponse.encryptedBody) redactedResponse.encryptedBody = "[REDACTED]";
        if (redactedResponse.decryptedContent) redactedResponse.decryptedContent = "[REDACTED]";
        if (Array.isArray(redactedResponse)) {
          // If it's a list of messages, redact each one
          const redactedList = redactedResponse.map((m: any) => ({
            ...m,
            body: m.body ? "[REDACTED]" : null,
            encryptedBody: m.encryptedBody ? "[REDACTED]" : null
          }));
          logLine += ` :: ${JSON.stringify(redactedList)}`;
        } else {
          logLine += ` :: ${JSON.stringify(redactedResponse)}`;
        }
      }

      if (logLine.length > 150) {
        logLine = logLine.slice(0, 149) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Setup vite only in development
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app on the port specified in the environment variable PORT
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, () => {
    log(`serving on http://127.0.0.1:${port}`);
  });

})();
