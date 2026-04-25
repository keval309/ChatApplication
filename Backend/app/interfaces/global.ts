import { Request } from "express";
import { JwtPayload } from "jsonwebtoken";
// Define your User type properly
export interface AuthUser extends JwtPayload {
  id: string;
  email?: string;
  role?: string;
}

// Define logger function types
type LogFunction = (message: string, meta?: unknown) => void;

export interface RequestExtended extends Request {
  user?: AuthUser;
  id?: string;
  traceId?: string;
  logId?: string;
  file?: Express.Multer.File;
  log?: LogFunction;
  error?: LogFunction;
  idAdmin?: boolean;
  filePath?: string;
}

export interface PdfInterface {
  bodyHtml: string;
  headerHtml: string;
  footerHtml: string;
}
