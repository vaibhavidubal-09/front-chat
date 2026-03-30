import { httpClient } from "../config/AxiosHelper";

// ============================================================
// SEND OTP
// ============================================================
export const sendOtpApi = (email, role) => {
  return httpClient.post("/auth/send-otp", null, {
    params: { email, role }
  });
};

// ============================================================
// VERIFY OTP
// ============================================================
export const verifyOtpApi = (email, otp) => {
  return httpClient.post("/auth/verify-otp", null, {
    params: { email, otp }
  });
};

// ============================================================
// CHECK VERIFIED USER
// ============================================================
export const checkVerifiedApi = (email) => {
  return httpClient.get("/auth/check-verified", {
    params: { email }
  });
};