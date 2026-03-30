export function timeAgo(date) {

  if (!date) return "";

  const now = new Date();
  const past = new Date(date);

  if (isNaN(past.getTime())) return "";

  let secondsAgo = Math.floor((now - past) / 1000);

  if (secondsAgo < 0) secondsAgo = 0;

  if (secondsAgo < 60)
    return `${secondsAgo} second${secondsAgo !== 1 ? "s" : ""} ago`;

  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60)
    return `${minutesAgo} minute${minutesAgo !== 1 ? "s" : ""} ago`;

  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24)
    return `${hoursAgo} hour${hoursAgo !== 1 ? "s" : ""} ago`;

  const daysAgo = Math.floor(hoursAgo / 24);
  if (daysAgo < 30)
    return `${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago`;

  const monthsAgo = Math.floor(daysAgo / 30);
  if (monthsAgo < 12)
    return `${monthsAgo} month${monthsAgo !== 1 ? "s" : ""} ago`;

  const yearsAgo = Math.floor(monthsAgo / 12);
  return `${yearsAgo} year${yearsAgo !== 1 ? "s" : ""} ago`;
}

export function formatDateTime(date) {
  if (!date) return "";

  const parsedDate = new Date(date);

  if (isNaN(parsedDate.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsedDate);
}

export function normalizeEmail(email) {
  return `${email || ""}`.trim().toLowerCase();
}

export function getSocketTopicKey(email) {
  return normalizeEmail(email).replace(/[^a-z0-9]/g, "_");
}
