const stripTrailingSlash = (value = "") => value.replace(/\/+$/, "");

const defaultApiBaseUrl = "https://chat-app-backend-po82.onrender.com";
const configuredApiBaseUrl = stripTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl
);

export const apiBaseUrl = configuredApiBaseUrl;
export const websocketUrl = `${configuredApiBaseUrl}/chat`;
