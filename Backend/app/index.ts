import express from "express";
import path from "path";
import routes from "./Routes";
import helmet from "helmet";
import md5 from 'md5';
import { v4 as uuidv4 } from 'uuid';
import cors from "cors";
import { RequestExtended } from "./interfaces/global";
import { logger } from "./utils/logger";

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const port = process.env.PORT || 8080;

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors());
app.use(
  helmet.hsts({
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req: RequestExtended, res, next) => {
	req.id = md5(uuidv4());
	req.traceId = req.header('eg-request-id') || '-';
	req.logId = [
		`traceId[${req.traceId}]`,
		`spanId[${req.id}]`,
		`user[${
			req.header('user.id')
				? req.header('user.id') + ',' + req.header('user.type')
				: '-'
		}]`,
	].join(' ');
	req.log = (...args: any[]) => {
		logger.info([new Date().toISOString(), req.logId, ...args].join(' '));
	};
	req.error = (...args: any[]) => {
		logger.error([new Date().toISOString(), req.logId, ...args].join(' '));
	};
	next();
});

app.use((req, res, next) => {
	res.setHeader('X-Frame-Options', 'DENY');
	res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
	res.setHeader('Permissions-Policy', 'interest-cohort=()');
	res.setHeader(
		'Strict-Transport-Security',
		'max-age=31536000; includeSubDomains'
	);
	res.setHeader(
		'Cache-Control',
		'no-store, no-cache, must-revalidate, max-age=0'
	);
	res.setHeader('Expires', 'Wed, 11 Jan 1984 05:00:00 GMT');
	res.setHeader('X-XSS-Protection', '1; mode=block');
	res.setHeader('Pragma', 'no-cache');
	res.removeHeader('Server');
	next();
});
app.use(routes);
app.listen(port, () => {
  console.log("server is started on the 8080 port");
});
