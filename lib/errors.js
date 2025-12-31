export const ErrorCode = {
  // Client errors (4xx equivalent)
  INVALID_ECOSYSTEM: "INVALID_ECOSYSTEM",
  INVALID_INPUT: "INVALID_INPUT",
  PACKAGE_NOT_FOUND: "PACKAGE_NOT_FOUND",

  // Server errors (5xx equivalent)
  DATABASE_ERROR: "DATABASE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // External errors
  API_ERROR: "API_ERROR",
  API_TIMEOUT: "API_TIMEOUT",
  API_UNAVAILABLE: "API_UNAVAILABLE",
};

export class McpError extends Error {
  constructor(code, message, details = null, retryable = false) {
    super(message);
    this.name = "McpError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
    };
  }

  toString() {
    let str = `[${this.code}] ${this.message}`;
    if (this.details) str += ` (${this.details})`;
    if (this.retryable) str += " - may retry";
    return str;
  }
}

export function invalidEcosystem(ecosystem) {
  return new McpError(
    ErrorCode.INVALID_ECOSYSTEM,
    `Unknown ecosystem: ${ecosystem}`,
    "Supported: npm, pypi, rubygems, cargo, go, maven, nuget, packagist, hex, pub, etc."
  );
}

export function packageNotFound(ecosystem, name) {
  return new McpError(
    ErrorCode.PACKAGE_NOT_FOUND,
    `Package not found: ${ecosystem}/${name}`
  );
}

export function apiError(status, statusText, url) {
  const retryable = status >= 500 || status === 429;
  return new McpError(
    ErrorCode.API_ERROR,
    `API error: ${status} ${statusText}`,
    url,
    retryable
  );
}

export function apiTimeout(url, timeoutMs) {
  return new McpError(
    ErrorCode.API_TIMEOUT,
    `API request timed out after ${timeoutMs}ms`,
    url,
    true
  );
}

export function databaseError(message) {
  return new McpError(
    ErrorCode.DATABASE_ERROR,
    `Database error: ${message}`
  );
}

export function invalidInput(message) {
  return new McpError(
    ErrorCode.INVALID_INPUT,
    message
  );
}
