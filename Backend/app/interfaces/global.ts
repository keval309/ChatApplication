import { Request } from "express";

export interface AuthUserContext {
  id: string;
  email: string;
  sessionId: string;
}

type LogFunction = (...args: unknown[]) => void;

export interface RequestExtended extends Request {
  user?: AuthUserContext;
  id?: string;
  traceId?: string;
  logId?: string;
  log?: LogFunction;
  error?: LogFunction;
  isAdmin?: boolean;
  filePath?: string;
}

export interface PdfInterface {
  bodyHtml: string;
  headerHtml: string;
  footerHtml: string;
}
