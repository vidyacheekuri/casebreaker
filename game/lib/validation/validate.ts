import { ZodError, type ZodSchema } from "zod";

export interface ValidationContext {
  endpoint: string;
  payload?: unknown;
}

export class ResponseValidationError extends Error {
  endpoint: string;

  constructor(endpoint: string) {
    super(`The server returned unexpected data for ${endpoint}. Please refresh and try again.`);
    this.name = "ResponseValidationError";
    this.endpoint = endpoint;
  }
}

export function validateResponse<T>(
  data: unknown,
  schema: ZodSchema<T>,
  context: ValidationContext | string
): T {
  const validationContext =
    typeof context === "string" ? { endpoint: context, payload: data } : { payload: data, ...context };

  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("[backend-client] response validation failed", {
        endpoint: validationContext.endpoint,
        issues: error.issues,
        payload: validationContext.payload,
      });
    } else {
      console.error("[backend-client] response validation failed", {
        endpoint: validationContext.endpoint,
        error,
        payload: validationContext.payload,
      });
    }

    throw new ResponseValidationError(validationContext.endpoint);
  }
}
