import type {
  ApiErrorEnvelope,
  ApplicationData,
  BatchResult,
  BatchVerificationRequestItem,
  VerificationResult
} from "../types/api";

export class VerificationApiError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(message: string, code = "request_failed", details: Record<string, unknown> = {}) {
    super(message);
    this.name = "VerificationApiError";
    this.code = code;
    this.details = details;
  }
}

function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL;
  if (!configuredUrl) {
    throw new VerificationApiError(
      "The verification service is not configured. Set VITE_API_BASE_URL and try again.",
      "configuration_error"
    );
  }

  return configuredUrl.replace(/\/+$/, "");
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== "object" || !("error" in value)) {
    return false;
  }

  const error = (value as { error?: unknown }).error;
  return Boolean(
    error &&
      typeof error === "object" &&
      typeof (error as { message?: unknown }).message === "string" &&
      typeof (error as { code?: unknown }).code === "string"
  );
}

async function readError(response: Response): Promise<VerificationApiError> {
  try {
    const payload = (await response.json()) as unknown;
    if (isApiErrorEnvelope(payload)) {
      return new VerificationApiError(
        payload.error.message,
        payload.error.code,
        payload.error.details
      );
    }
  } catch {
    // Fall through to a safe generic message.
  }

  return new VerificationApiError(
    "The verification service could not check this label. Please try again.",
    "request_failed"
  );
}

export async function verifyLabel(
  image: File,
  applicationData: ApplicationData
): Promise<VerificationResult> {
  const formData = new FormData();
  formData.append("image", image);
  formData.append("application_data", JSON.stringify(applicationData));

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/verify`, {
      method: "POST",
      body: formData
    });
  } catch (error) {
    if (error instanceof VerificationApiError) {
      throw error;
    }

    throw new VerificationApiError(
      "Could not reach the verification service. Please check the connection and try again.",
      "network_error"
    );
  }

  if (!response.ok) {
    throw await readError(response);
  }

  return response.json() as Promise<VerificationResult>;
}

export async function verifyBatch(items: BatchVerificationRequestItem[]): Promise<BatchResult> {
  const formData = new FormData();
  for (const item of items) {
    formData.append("images", item.image);
    formData.append("application_data", JSON.stringify(item.application_data));
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/verify/batch`, {
      method: "POST",
      body: formData
    });
  } catch (error) {
    if (error instanceof VerificationApiError) {
      throw error;
    }

    throw new VerificationApiError(
      "Could not reach the verification service. Please check the connection and try again.",
      "network_error"
    );
  }

  if (!response.ok) {
    throw await readError(response);
  }

  return response.json() as Promise<BatchResult>;
}
