import express from "express";
import path from "path";
import helmet from "helmet";
import md5 from "md5";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import cookieParser from "cookie-parser";

import { env } from "./config/env";
import routes from "./Routes";
import { RequestExtended } from "./interfaces/global";
import { logger } from "./utils/logger";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  helmet.hsts({
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true,
  }),
);

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    maxAge: "1h",
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

app.use((req: RequestExtended, _res, next) => {
  req.id = md5(uuidv4());
  req.traceId = req.header("eg-request-id") || "-";
  req.logId = [
    `traceId[${req.traceId}]`,
    `spanId[${req.id}]`,
    `user[${req.user?.id ?? "-"}]`,
  ].join(" ");
  req.log = (...args: unknown[]) => {
    logger.info([new Date().toISOString(), req.logId, ...args].join(" "));
  };
  req.error = (...args: unknown[]) => {
    logger.error([new Date().toISOString(), req.logId, ...args].join(" "));
  };
  next();
});

app.use((_req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "interest-cohort=()");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  res.setHeader("Expires", "Wed, 11 Jan 1984 05:00:00 GMT");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Pragma", "no-cache");
  res.removeHeader("Server");
  next();
});

app.use(routes);

export { app };
export default app;
