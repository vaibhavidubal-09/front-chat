export function getApiErrorMessage(error, fallback = "Something went wrong") {
  const data = error?.response?.data;

  if (typeof data === "string") {
    return data;
  }

  if (data && typeof data === "object") {
    return (
      data.message ||
      data.error ||
      data.detail ||
      fallback
    );
  }

  return error?.message || fallback;
}
