import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env";
import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import type { GoogleProfileDTO } from "./auth.types";

let cachedClient: OAuth2Client | null = null;

function getGoogleClient(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new ApiException({
      ...ErrorCodes.INTERNAL,
      errorDescription: "Google OAuth is not configured on the server",
    });
  }
  if (!cachedClient) {
    cachedClient = new OAuth2Client({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    });
  }
  return cachedClient;
}

export function generateOAuthState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const client = getGoogleClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["openid", "email", "profile"],
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfileDTO> {
  const client = getGoogleClient();
  let tokens;
  try {
    const result = await client.getToken(code);
    tokens = result.tokens;
  } catch (err) {
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Failed to exchange Google authorization code",
      error: err,
    });
  }

  if (!tokens.id_token) {
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Google did not return an id_token",
    });
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) {
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Google profile missing required fields",
    });
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: Boolean(payload.email_verified),
    name: payload.name ?? undefined,
    picture: payload.picture ?? undefined,
  };
}
