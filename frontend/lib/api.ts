import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";

/* =======================================================
   ENV CONFIG
======================================================= */

const endPoint: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/* =======================================================
   AXIOS INSTANCE
======================================================= */

const api: AxiosInstance = axios.create({
  baseURL: endPoint,
});

/* =======================================================
   API CONFIG
======================================================= */

const apiConfig = (isMultipart = false): AxiosRequestConfig => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  if (token) {
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": isMultipart
          ? "multipart/form-data"
          : "application/json",
      },
    };
  }

  return {
    withCredentials: false,
  };
};

/* =======================================================
   NAVIGATION HANDLER (For 401 redirect)
======================================================= */

type NavigateHandler = (path: string) => void;
type ApiErrorPayload = {
  code?: number;
  status?: number;
  errorDescription?: string;
};

let navigateRef: NavigateHandler | null = null;

export const setNavigate = (navigateInstance: NavigateHandler): void => {
  navigateRef = navigateInstance;
};

/* =======================================================
   RESPONSE INTERCEPTOR
======================================================= */

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<{ error?: ApiErrorPayload; message?: string }>) => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;

    if (error.response?.status === 401 && token) {
      navigateRef?.("/login");
    }

    if (
      error.response?.data?.error?.code === 102 &&
      error.response?.data?.error?.status === 400 &&
      error.response?.data?.message === "Bad request"
    ) {
      const description = error.response.data.error?.errorDescription ?? "";

      const fullMessage = description
        .split(",")
        .map((msg: string) => msg.trim())
        .filter(Boolean)[0];

      if (error.response.data) {
        error.response.data.message =
          fullMessage || description || error.response.data.message;
      }
    }

    return Promise.reject(error);
  }
);

/* =======================================================
   GENERIC API METHODS
======================================================= */

export const getApi = <T>(
  url: string,
  params?: Record<string, unknown>
): Promise<AxiosResponse<T>> => {
  return api.get<T>(url, {
    params,
    ...apiConfig(),
  });
};

export const postApi = <T, D = unknown>(
  url: string,
  data?: D,
  isMultipart?: boolean
): Promise<AxiosResponse<T>> => {
  return api.post<T>(url, data, apiConfig(isMultipart));
};

export const putApi = <T, D = unknown>(
  url: string,
  data: D,
  isMultipart?: boolean
): Promise<AxiosResponse<T>> => {
  return api.put<T>(url, data, apiConfig(isMultipart));
};

export const deleteApi = <T>(url: string): Promise<AxiosResponse<T>> => {
  return api.delete<T>(url, apiConfig());
};

export const deleteApiWithData = <T, D = unknown>(
  url: string,
  data?: D
): Promise<AxiosResponse<T>> => {
  return api.delete<T>(url, {
    data,
    ...apiConfig(),
  });
};

export const putApiNoHeader = <T, D = unknown>(
  url: string,
  data: D
): Promise<AxiosResponse<T>> => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  if (!token) {
    return Promise.reject(new Error("No access token available"));
  }

  return api.put<T>(url, data, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/* =======================================================
   FILE DOWNLOAD APIs
======================================================= */

export const getApiExcel = (
  url: string,
  params?: Record<string, unknown>
): Promise<AxiosResponse<ArrayBuffer>> => {
  return api.get(url, {
    params,
    responseType: "arraybuffer",
    ...apiConfig(),
  });
};

export const getApiPDF = (
  url: string,
  params?: Record<string, unknown>
): Promise<AxiosResponse<Blob>> => {
  return api.get(url, {
    params,
    responseType: "blob",
    ...apiConfig(),
  });
};

export const getApiCSV = (
  url: string,
  params?: Record<string, unknown>
): Promise<AxiosResponse<ArrayBuffer>> => {
  return api.get(url, {
    params,
    responseType: "arraybuffer",
    ...apiConfig(),
  });
};
