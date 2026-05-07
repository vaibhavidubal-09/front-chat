import React, { useState, useEffect } from "react";
import chatIcon from "../assets/chat.png";
import toast from "react-hot-toast";

import {
  createRoomApi,
  joinRoomApi,
  getRoomApi
} from "../services/RoomService";

import { useChatContext } from "../context/useChatContext";
import { useLocation, useNavigate } from "react-router-dom";

import {
  sendOtpApi,
  verifyOtpApi,
  checkVerifiedApi,
  loginApi,
} from "../services/AuthService";
import { getApiErrorMessage } from "../config/error";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const JoinCreateChat = () => {

  const [detail, setDetail] = useState({
    roomId: "",
    userName: "",
    emailId: "",
  });

  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    setRoomId,
    setCurrentUser,
    setCurrentUserEmail,
    setCurrentUserRole,
    setConnected,
    setAuthToken,
  } = useChatContext();

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const invitedRoomId = params.get("roomId");

    if (!invitedRoomId) return;

    setDetail((prev) => ({
      ...prev,
      roomId: invitedRoomId || prev.roomId,
    }));
  }, [location.search]);


  // AUTO CHECK VERIFIED EMAIL
  useEffect(() => {
    const email = detail.emailId.trim();

    if (!emailPattern.test(email)) {
      setIsVerified(false);
      setCheckingVerification(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setCheckingVerification(true);

      checkVerifiedApi(email, { signal: controller.signal })
        .then((res) => {
          setIsVerified(res.data === true);
        })
        .catch((error) => {
          if (error.code !== "ERR_CANCELED" && error.name !== "CanceledError") {
            setIsVerified(false);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setCheckingVerification(false);
          }
        });
    }, 600);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      setCheckingVerification(false);
    };

  }, [detail.emailId]);

  useEffect(() => {
    setOtp("");
  }, [detail.emailId]);


  function handleFormInputChange(event) {

    setDetail({
      ...detail,
      [event.target.name]: event.target.value,
    });

  }


  // SEND OTP
  async function sendOtp() {

    if (!detail.emailId) {
      toast.error("Enter email first");
      return;
    }

    try {
      setSendingOtp(true);

      await sendOtpApi(detail.emailId, "STUDENT");

      toast.success("OTP sent to email");

    } catch {
      toast.error("Failed to send OTP");
    } finally {
      setSendingOtp(false);
    }
  }


  // VERIFY OTP
  async function verifyOtp() {

    if (!password.trim()) {
      toast.error("Enter a password first");
      return;
    }

    try {
      setVerifyingOtp(true);

      const response = await verifyOtpApi(detail.emailId, otp, password);

      toast.success("Email verified");

      setIsVerified(true);
      setCurrentUser(detail.userName);
      setCurrentUserEmail(detail.emailId);
      setCurrentUserRole(response.data.role || "STUDENT");
      setAuthToken(response.data.token);
      localStorage.setItem("authToken", response.data.token || "");
      localStorage.setItem("authEmail", detail.emailId);
      localStorage.setItem("currentUser", detail.userName || "");
      localStorage.setItem("currentUserEmail", detail.emailId || "");
      localStorage.setItem("currentUserRole", response.data.role || "STUDENT");

    } catch (error) {
      toast.error(getApiErrorMessage(error, "Invalid OTP"));
    } finally {
      setVerifyingOtp(false);
    }
  }


  // VALIDATION
  function validateForm() {

    const { roomId, userName, emailId } = detail;

    if (!roomId || !userName || !emailId || !password.trim()) {

      toast.error("All fields required");

      return false;
    }

    if (!isVerified) {

      toast.error("Verify email first");

      return false;
    }

    return true;
  }

  async function ensureLogin() {
    const storedToken = localStorage.getItem("authToken");
    const storedEmail = localStorage.getItem("authEmail");

    if (
      storedToken &&
      storedEmail &&
      storedEmail.trim().toLowerCase() === detail.emailId.trim().toLowerCase()
    ) {
      return;
    }

    const response = await loginApi(detail.emailId, password);
    setCurrentUser(detail.userName);
    setCurrentUserEmail(detail.emailId);
    setCurrentUserRole(response.data.role || "STUDENT");
    setAuthToken(response.data.token);
    localStorage.setItem("authToken", response.data.token || "");
    localStorage.setItem("authEmail", detail.emailId);
    localStorage.setItem("currentUser", detail.userName || "");
    localStorage.setItem("currentUserEmail", detail.emailId || "");
    localStorage.setItem("currentUserRole", response.data.role || "STUDENT");
  }


  // JOIN CLASS
  async function joinChat() {

    if (!validateForm()) return;

    try {
      setSubmitting(true);

      if (!isVerified) {
        toast.error("Verify email first");
        return;
      }

      await ensureLogin();

      await joinRoomApi(detail.roomId, detail.emailId);

      const room = await getRoomApi(detail.roomId);

      setRoomId(room.roomId);
      setConnected(true);

      toast.success("Entered class successfully");

      navigate("/dashboard");

    } catch (error) {
      toast.error(getApiErrorMessage(error, "Join failed"));
    } finally {
      setSubmitting(false);
    }
  }


  // CREATE CLASS
  async function createRoom() {

    if (!validateForm()) return;

    try {
      setSubmitting(true);

      if (!isVerified) {
        toast.error("Verify email first");
        return;
      }

      await ensureLogin();

      const room = await createRoomApi({
        email: detail.emailId,
        roomName: detail.roomId
      });

      setRoomId(room.roomId);
      setConnected(true);

      toast.success("Class created successfully");

      navigate("/dashboard");

    } catch (error) {
      toast.error(getApiErrorMessage(error, "Create class failed"));
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">

      <div className="p-10 w-full flex flex-col gap-5 max-w-md rounded bg-slate-800 shadow">

        <img src={chatIcon} className="w-24 mx-auto" />

        <h1 className="text-2xl font-semibold text-center">
          Smart Classroom Chat
        </h1>

        <p className="text-sm text-slate-300 text-center leading-6">
          Verify your email first, then enter your password to continue.
          <br />
          Role access is assigned by the backend after login.
        </p>


        {/* NAME */}
        <input
          name="userName"
          placeholder="Your Name"
          value={detail.userName}
          onChange={handleFormInputChange}
          className="px-4 py-2 rounded bg-slate-700"
        />


        {/* CLASS */}
        <input
          name="roomId"
          placeholder="Class Code or Name"
          value={detail.roomId}
          onChange={handleFormInputChange}
          className="px-4 py-2 rounded bg-slate-700"
        />


        {/* EMAIL */}
        <input
          name="emailId"
          type="email"
          placeholder="Email"
          value={detail.emailId}
          onChange={handleFormInputChange}
          className="px-4 py-2 rounded bg-slate-700"
        />

        {/* PASSWORD */}
        <input
          name="password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="px-4 py-2 rounded bg-slate-700"
        />


        {/* OTP */}
        <div className="flex gap-2">

          <button
            onClick={sendOtp}
            disabled={sendingOtp || !detail.emailId}
            className="bg-blue-600 px-3 py-2 rounded"
          >
            {sendingOtp ? "Sending..." : "Send OTP"}
          </button>

          <input
            placeholder="OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="px-3 py-2 rounded bg-slate-700"
          />

          <button
            onClick={verifyOtp}
            disabled={verifyingOtp || !otp}
            className="bg-green-600 px-3 py-2 rounded"
          >
            {verifyingOtp ? "Checking..." : "Verify"}
          </button>

        </div>


        {isVerified && (
          <p className="text-green-400 text-center">
            Email Verified
          </p>
        )}

        {isVerified && password.trim() && (
          <p className="text-xs text-slate-400 text-center">
            Password is required before joining or creating a class.
          </p>
        )}

        {!isVerified && detail.emailId && !checkingVerification && (
          <p className="text-sm text-slate-300 text-center">
            Verify your email to continue.
          </p>
        )}

        {checkingVerification && (
          <p className="text-sm text-slate-300 text-center">
            Checking verification status...
          </p>
        )}


        {/* ACTION BUTTONS */}
        <div className="flex gap-3 justify-center">

          <button
          onClick={joinChat}
          disabled={submitting}
          className="bg-blue-500 px-4 py-2 rounded"
        >
          {submitting ? "Joining..." : "Join Class"}
        </button>

          <button
          onClick={createRoom}
          disabled={submitting}
          className="bg-orange-500 px-4 py-2 rounded"
        >
          {submitting ? "Creating..." : "Create Class"}
        </button>

        </div>

      </div>
    </div>
  );
};

export default JoinCreateChat;
