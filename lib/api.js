import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { apiError, apiTimeout } from "./errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

export const VERSION = pkg.version;
export const API_BASE = "https://packages.ecosyste.ms/api/v1";
export const USER_AGENT = `ecosystems-mcp/${VERSION}`;
export const DEFAULT_TIMEOUT_MS = 30000;

export async function fetchAPI(path, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  // Remove leading slash to ensure path is appended to API_BASE
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`${API_BASE}/${cleanPath}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, value);
    }
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw apiError(response.status, response.statusText, url.toString());
    }

    return response.json();
  } catch (err) {
    if (err.name === "AbortError") {
      throw apiTimeout(url.toString(), timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
