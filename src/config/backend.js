const stripTrailingSlash = (value = "") => value.replace(/\/+$/, "");

const defaultApiBaseUrl = "http://localhost:8080";
const configuredApiBaseUrl = stripTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl
);

export const apiBaseUrl = configuredApiBaseUrl;
export const websocketUrl = `${configuredApiBaseUrl}/chat`;
