const stripTrailingSlash = (value = "") => value.replace(/\/+$/, "");

const defaultApiBaseUrl = "https://chat-app-backend-po82.onrender.com";
const configuredApiBaseUrl = stripTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl
);

const wsProtocol = configuredApiBaseUrl.startsWith("https") ? "wss" : "ws";
const wsBaseUrl = configuredApiBaseUrl.replace(/^https?:\/\//, "");

export const apiBaseUrl = configuredApiBaseUrl;
export const websocketUrl = `${wsProtocol}://${wsBaseUrl}/chat`;
