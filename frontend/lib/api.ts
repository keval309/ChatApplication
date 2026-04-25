import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export interface ApiSuccessEnvelope<T> {
  data: T;
  responseStatus: 200;
}

export interface ApiErrorPayload {
  code?: number;
  status?: number;
  message?: string;
  errorDescription?: string;
}

export interface ApiErrorEnvelope {
  error?: ApiErrorPayload;
  message?: string;
  responseStatus?: number;
}

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

interface RetryableAxiosConfig extends InternalAxiosRequestConfig {
  __isRefreshRetry?: boolean;
  __skipAuthRefresh?: boolean;
}

let refreshPromise: Promise<void> | null = null;

async function performRefresh(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = api
      .post<ApiSuccessEnvelope<{ user: unknown }>>(
        "/api/auth/refresh",
        undefined,
        { __skipAuthRefresh: true } as AxiosRequestConfig,
      )
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

let onUnauthenticated: (() => void) | null = null;

export function setUnauthenticatedHandler(fn: (() => void) | null): void {
  onUnauthenticated = fn;
}

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError<ApiErrorEnvelope>) => {
    const original = error.config as RetryableAxiosConfig | undefined;
    const status = error.response?.status;
    const url = original?.url ?? "";

    // Skip refresh for the auth endpoints themselves to avoid loops
    const isAuthFlowEndpoint =
      url.includes("/api/auth/refresh") ||
      url.includes("/api/auth/login") ||
      url.includes("/api/auth/register") ||
      url.includes("/api/auth/logout");

    if (
      status === 401 &&
      original &&
      !original.__isRefreshRetry &&
      !original.__skipAuthRefresh &&
      !isAuthFlowEndpoint
    ) {
      try {
        await performRefresh();
        original.__isRefreshRetry = true;
        return api.request(original);
      } catch {
        onUnauthenticated?.();
      }
    }

    return Promise.reject(error);
  },
);

export function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiErrorEnvelope | undefined;
    if (data?.error?.errorDescription) {
      return firstSegment(data.error.errorDescription);
    }
    if (data?.message && data.message !== "Bad request") return data.message;
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function firstSegment(str: string): string {
  const first = str.split(",").map((s) => s.trim()).filter(Boolean)[0];
  return first ?? str;
}

export async function unwrap<T>(
  promise: Promise<AxiosResponse<ApiSuccessEnvelope<T>>>,
): Promise<T> {
  const res = await promise;
  return res.data.data;
}
