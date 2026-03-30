import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import toast from "react-hot-toast";
import { websocketUrl } from "../config/backend";
import {
  createRoomApi,
  getRoomApi,
  getTeacherClasses,
  getStudentClasses,
  getRoomMembersApi,
  addStudentToRoomApi,
  activateStudentInRoomApi,
  blockStudentInRoomApi
} from "../services/RoomService";
import { useChatContext } from "../context/useChatContext";
import { getSocketTopicKey, normalizeEmail } from "../config/helper";

const REFRESH_INTERVAL_MS = 15000;
const USER_EMOJIS = ["🙂", "😎", "🧑", "👩", "👨", "🌟", "🚀", "📘"];

const Dashboard = () => {
  const {
    currentUser,
    currentUserEmail,
    currentUserRole,
    setRoomId,
    setConnected
  } = useChatContext();

  const navigate = useNavigate();
  const isTeacher = currentUserRole === "TEACHER";
  const previousMeetingStateRef = useRef({});
  const wsClientRef = useRef(null);
  const pendingTeacherMeetingRef = useRef("");

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [studentEmail, setStudentEmail] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [meetingLinks, setMeetingLinks] = useState({});
  const [locallyBlockedEmails, setLocallyBlockedEmails] = useState([]);
  const [moderationAlerts, setModerationAlerts] = useState([]);

  const selectedRoom =
    classes.find((entry) => entry.roomId === selectedRoomId) || null;

  const loadClasses = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }

      const email = currentUserEmail?.toLowerCase();
      const response = isTeacher
        ? await getTeacherClasses(email)
        : await getStudentClasses(email);

      const nextClasses = response || [];

      if (!isTeacher) {
        nextClasses.forEach((room) => {
          const previousState = previousMeetingStateRef.current[room.roomId];

          if (
            previousState === false &&
            room.meetingActive === true
          ) {
            toast.success(`${room.roomName} meeting is live now`);
          }

          previousMeetingStateRef.current[room.roomId] = Boolean(
            room.meetingActive
          );
        });
      }

      setClasses(nextClasses);

      if (nextClasses.length === 0) {
        setSelectedRoomId("");
        return;
      }

      setSelectedRoomId((current) => {
        const hasCurrent = nextClasses.some((room) => room.roomId === current);
        return hasCurrent ? current : nextClasses[0].roomId;
      });
    } catch (error) {
      console.error("Dashboard load error:", error);
      if (!silent) {
        toast.error("Failed to load dashboard");
      }
      setClasses([]);
      setSelectedRoomId("");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentUserEmail, isTeacher]);

  useEffect(() => {
    if (!currentUserEmail) return;

    loadClasses();
  }, [currentUserEmail, loadClasses]);

  useEffect(() => {
    if (!currentUserEmail || isTeacher) return;

    const intervalId = setInterval(() => {
      loadClasses({ silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [currentUserEmail, isTeacher, loadClasses]);

  useEffect(() => {
    const loadMembers = async () => {
      if (!isTeacher || !selectedRoomId) {
        setMembers([]);
        setLocallyBlockedEmails([]);
        setModerationAlerts([]);
        return;
      }

      try {
        setMembersLoading(true);
        const room = await getRoomApi(selectedRoomId);
        const response = await getRoomMembersApi(selectedRoomId);
        setMembers(response || []);
        setLocallyBlockedEmails(
          (response || [])
            .filter((member) => member.blocked)
            .map((member) => member.email)
        );
        setModerationAlerts(
          ((room?.moderationAlerts || []).filter((alert) => !alert.resolved))
            .sort((left, right) => new Date(right.detectedAt) - new Date(left.detectedAt))
        );
      } catch (error) {
        console.error("Members load error:", error);
        setMembers([]);
        setModerationAlerts([]);
      } finally {
        setMembersLoading(false);
      }
    };

    loadMembers();
  }, [isTeacher, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoomId) {
      setOnlineUsers([]);
      return;
    }

    const stompClient = new Client({
      webSocketFactory: () => new SockJS(websocketUrl),
      reconnectDelay: 5000,
      onConnect: () => {
        stompClient.subscribe(`/topic/online/${selectedRoomId}`, (msg) => {
          try {
            const payload = JSON.parse(msg.body);
            setOnlineUsers(Array.isArray(payload) ? payload : []);
          } catch {
            setOnlineUsers([]);
          }
        });

        if (isTeacher) {
          stompClient.subscribe(`/topic/moderation/${selectedRoomId}`, (msg) => {
            try {
              const payload = JSON.parse(msg.body);
              setModerationAlerts((prev) => {
                if (prev.some((alert) => alert.id === payload.id)) {
                  return prev;
                }

                return [payload, ...prev];
              });
            } catch {
              // Ignore unsupported moderation payloads.
            }
          });
        }

        stompClient.subscribe(`/topic/room-events/${selectedRoomId}`, (msg) => {
          try {
            const payload = JSON.parse(msg.body);
            const studentEmail = normalizeEmail(payload.studentEmail);
            const blocked = Boolean(payload.blocked);

            setMembers((prev) =>
              prev.map((member) =>
                normalizeEmail(member.email) === studentEmail
                  ? { ...member, blocked }
                  : member
              )
            );

            setLocallyBlockedEmails((prev) => {
              const withoutStudent = prev.filter(
                (email) => normalizeEmail(email) !== studentEmail
              );

              return blocked
                ? [...withoutStudent, studentEmail]
                : withoutStudent;
            });

            if (!isTeacher && studentEmail === normalizeEmail(currentUserEmail)) {
              toast[blocked ? "error" : "success"](
                blocked
                  ? "You were blocked from this class"
                  : "You were reactivated in this class"
              );
            }
          } catch {
            // Ignore unsupported room event payloads.
          }
        });

        if (currentUserEmail) {
          stompClient.publish({
            destination: `/app/join/${selectedRoomId}`,
            body: currentUserEmail
          });
        }
      }
    });

    stompClient.activate();
    return () => stompClient.deactivate();
  }, [selectedRoomId, currentUserEmail, isTeacher]);

  useEffect(() => {
    if (!currentUserEmail || classes.length === 0) return;

    const stompClient = new Client({
      webSocketFactory: () => new SockJS(websocketUrl),
      reconnectDelay: 5000,
      onConnect: () => {
        wsClientRef.current = stompClient;

        classes.forEach((room) => {
          stompClient.subscribe(`/topic/room/${room.roomId}`, (msg) => {
            try {
              const payload = JSON.parse(msg.body);
              const senderEmail = normalizeEmail(payload.sender);
              const type = `${payload.type || ""}`.toUpperCase();

              if (!senderEmail || senderEmail === normalizeEmail(currentUserEmail)) {
                return;
              }

              if (type === "MEETING") {
                return;
              }

              if (selectedRoomId === room.roomId) {
                return;
              }

              toast(`New group message in ${room.roomName}`);
            } catch {
              // Ignore unsupported room message payloads.
            }
          });

          stompClient.subscribe(`/topic/meeting/${room.roomId}`, (msg) => {
            const payload = msg.body;
            const meetingEnded = payload === "ENDED";

            setClasses((prev) =>
              prev.map((item) =>
                item.roomId === room.roomId
                  ? { ...item, meetingActive: !meetingEnded }
                  : item
              )
            );

            if (meetingEnded) {
              setMeetingLinks((prev) => {
                const next = { ...prev };
                delete next[room.roomId];
                return next;
              });

              if (!isTeacher) {
                toast(`Meeting ended in ${room.roomName}`);
              }
              return;
            }

            setMeetingLinks((prev) => ({
              ...prev,
              [room.roomId]: payload
            }));

            if (isTeacher && wsClientRef.current) {
              wsClientRef.current.publish({
                destination: `/app/sendMessage/${room.roomId}`,
                body: JSON.stringify({
                  sender: currentUserEmail,
                  content: payload,
                  type: "MEETING"
                })
              });
            }

            if (isTeacher && pendingTeacherMeetingRef.current === room.roomId) {
              pendingTeacherMeetingRef.current = "";
              window.open(payload, "_blank", "noopener,noreferrer");
            }

            if (!isTeacher) {
              toast.custom((t) => (
                <div className="rounded-2xl border border-emerald-400/30 bg-slate-900 px-4 py-3 text-white shadow-xl">
                  <p className="font-semibold">{room.roomName} is live now</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Your teacher started the meeting.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        toast.dismiss(t.id);
                        window.open(payload, "_blank", "noopener,noreferrer");
                      }}
                      className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Join Now
                    </button>
                    <button
                      onClick={() => {
                        toast.dismiss(t.id);
                        setSelectedRoomId(room.roomId);
                      }}
                      className="rounded-xl bg-white/10 px-3 py-2 text-sm"
                    >
                      View Class
                    </button>
                  </div>
                </div>
              ));
            }
          });
        });

        stompClient.subscribe(
          `/topic/notifications/${getSocketTopicKey(currentUserEmail)}`,
          (msg) => {
            try {
              const payload = JSON.parse(msg.body);
              const roomMatches = payload.roomId === selectedRoomId;

              if (payload.type === "MODERATION_ALERT" && isTeacher && roomMatches) {
                const alert = payload.moderationAlert;
                if (!alert) return;

                setModerationAlerts((prev) => {
                  if (prev.some((item) => item.id === alert.id)) {
                    return prev;
                  }

                  return [alert, ...prev];
                });

                toast(payload.message || "A message was flagged for moderation");
              }

              if (payload.type === "MODERATION_WARNING") {
                toast.error(payload.message || "Your message was flagged");
              }

              if (
                (payload.type === "ROOM_MEMBER_BLOCKED" ||
                  payload.type === "ROOM_MEMBER_UNBLOCKED") &&
                !isTeacher &&
                !roomMatches &&
                normalizeEmail(payload.studentEmail) === normalizeEmail(currentUserEmail)
              ) {
                toast[payload.blocked ? "error" : "success"](
                  payload.blocked
                    ? "You were blocked from this class"
                    : "You were reactivated in this class"
                );
              }

              if (
                payload.type === "PRIVATE_MESSAGE" &&
                normalizeEmail(payload.senderEmail) !== normalizeEmail(currentUserEmail)
              ) {
                const roomLabel = payload.roomName || payload.roomId || "your class";
                toast(`New private message from ${formatDisplayName(payload.senderEmail)} in ${roomLabel}`);
              }
            } catch {
              // Ignore unsupported notification payloads.
            }
          }
        );
      }
    });

    stompClient.activate();

    return () => {
      if (wsClientRef.current === stompClient) {
        wsClientRef.current = null;
      }
      stompClient.deactivate();
    };
  }, [classes, currentUserEmail, isTeacher]);

  const openClass = (room) => {
    setRoomId(room.roomId);
    setConnected(true);
    navigate("/chat");
  };

  const getDisplayName = (value) => {
    if (typeof value === "string") {
      return value.split("@")[0];
    }

    return (
      value?.name ||
      value?.userName ||
      value?.email?.split("@")[0] ||
      value?.userEmail?.split("@")[0] ||
      "User"
    );
  };

  const getDisplayMail = (value) => {
    if (typeof value === "string") {
      return value;
    }

    return value?.email || value?.userEmail || value?.studentEmail || "";
  };

  const formatDisplayName = (value) => {
    const source = getDisplayName(value);
    return source
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const getInitial = (value) => {
    return formatDisplayName(value).charAt(0).toUpperCase() || "U";
  };

  const refreshTeacherMembers = async () => {
    if (!selectedRoomId || !isTeacher) return;

    try {
      const response = await getRoomMembersApi(selectedRoomId);
      const room = await getRoomApi(selectedRoomId);
      setMembers(response || []);
      setLocallyBlockedEmails(
        (response || [])
          .filter((member) => member.blocked)
          .map((member) => member.email)
      );
      setModerationAlerts(
        ((room?.moderationAlerts || []).filter((alert) => !alert.resolved))
          .sort((left, right) => new Date(right.detectedAt) - new Date(left.detectedAt))
      );
    } catch {
      setMembers([]);
      setModerationAlerts([]);
    }
  };

  const handleAddStudent = async () => {
    if (!selectedRoomId || !studentEmail.trim()) {
      toast.error("Enter a student email first");
      return;
    }

    try {
      setBusyAction("add-student");
      await addStudentToRoomApi(
        selectedRoomId,
        currentUserEmail,
        studentEmail.trim()
      );
      toast.success("Student added");
      setStudentEmail("");
      await refreshTeacherMembers();
    } catch (error) {
      toast.error(error.response?.data || "Could not add student");
    } finally {
      setBusyAction("");
    }
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) {
      toast.error("Enter a class name first");
      return;
    }

    try {
      setBusyAction("create-class");
      const room = await createRoomApi({
        email: currentUserEmail,
        roomName: newClassName.trim()
      });

      setClasses((prev) => [room, ...prev]);
      setSelectedRoomId(room.roomId);
      setNewClassName("");
      toast.success("Class created successfully");
    } catch (error) {
      toast.error(error.response?.data || "Could not create class");
    } finally {
      setBusyAction("");
    }
  };

  const selectedRoomInviteLink = selectedRoom
    ? `${window.location.origin}/?roomId=${encodeURIComponent(selectedRoom.roomId)}&role=STUDENT`
    : "";

  const handleCopyInviteLink = async () => {
    if (!selectedRoomInviteLink) return;

    try {
      await navigator.clipboard.writeText(selectedRoomInviteLink);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy invite link");
    }
  };

  const handleSendInviteLink = () => {
    if (!selectedRoomInviteLink || !selectedRoom) return;

    const subject = encodeURIComponent(`Join ${selectedRoom.roomName}`);
    const body = encodeURIComponent(
      `Join my class ${selectedRoom.roomName}.\n\nClass code: ${selectedRoom.roomId}\nInvite link: ${selectedRoomInviteLink}`
    );

    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleBlockStudent = async (email) => {
    try {
      setBusyAction(`block-${email}`);
      setLocallyBlockedEmails((prev) =>
        prev.includes(email) ? prev : [...prev, email]
      );
      setMembers((prev) =>
        prev.map((member) =>
          (member.email || member.studentEmail || member.userEmail || member) === email
            ? { ...member, blocked: true }
            : member
        )
      );
      await blockStudentInRoomApi(selectedRoomId, currentUserEmail, email);
      setModerationAlerts((prev) =>
        prev.map((alert) =>
          alert.senderEmail === email ? { ...alert, resolved: true } : alert
        )
      );
      toast.success("Student blocked");
      await refreshTeacherMembers();
    } catch (error) {
      await refreshTeacherMembers();
      toast.error(error.response?.data || "Could not block student");
    } finally {
      setBusyAction("");
    }
  };

  const handleActivateStudent = async (email) => {
    try {
      setBusyAction(`activate-${email}`);
      setLocallyBlockedEmails((prev) => prev.filter((item) => item !== email));
      setMembers((prev) =>
        prev.map((member) =>
          (member.email || member.studentEmail || member.userEmail || member) === email
            ? { ...member, blocked: false, isBlocked: false, status: "ACTIVE" }
            : member
        )
      );
      await activateStudentInRoomApi(selectedRoomId, currentUserEmail, email);
      toast.success("Student activated");
      await refreshTeacherMembers();
    } catch (error) {
      await refreshTeacherMembers();
      toast.error(error.response?.data || "Could not activate student");
    } finally {
      setBusyAction("");
    }
  };

  const handleMeetingToggle = async (meetingActive) => {
    if (!selectedRoomId) return;
    if (!wsClientRef.current || !currentUserEmail) {
      toast.error("Meeting connection is not ready yet");
      return;
    }

    try {
      setBusyAction("meeting");
      if (meetingActive && isTeacher) {
        pendingTeacherMeetingRef.current = selectedRoomId;
      }
      wsClientRef.current.publish({
        destination: meetingActive
          ? `/app/startMeeting/${selectedRoomId}`
          : `/app/stopMeeting/${selectedRoomId}`,
        body: currentUserEmail
      });
      toast.success(meetingActive ? "Meeting started" : "Meeting stopped");
    } catch (error) {
      pendingTeacherMeetingRef.current = "";
      toast.error(error.response?.data || "Could not update meeting");
    } finally {
      setBusyAction("");
    }
  };

  const roomStats = useMemo(() => {
    return {
      totalClasses: classes.length,
      liveClasses: classes.filter((room) => room.meetingActive).length,
      onlineNow: onlineUsers.length
    };
  }, [classes, onlineUsers.length]);

  const handleJoinMeeting = (room) => {
    const meetingLink = meetingLinks[room.roomId];

    if (meetingLink) {
      window.open(meetingLink, "_blank", "noopener,noreferrer");
      return;
    }

    openClass(room);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-black/20 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
              {isTeacher ? "Teacher Dashboard" : "Student Dashboard"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {isTeacher ? "Manage one class at a time, clearly." : "See your class status and join fast."}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {currentUser || currentUserEmail || "Guest"}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs text-slate-400">Classes</p>
              <p className="mt-1 text-2xl font-semibold">{roomStats.totalClasses}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs text-slate-400">Live</p>
              <p className="mt-1 text-2xl font-semibold">{roomStats.liveClasses}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs text-slate-400">Online</p>
              <p className="mt-1 text-2xl font-semibold">{roomStats.onlineNow}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Classes</h2>
              <span className="text-xs text-slate-400">
                {loading ? "Loading..." : `${classes.length} total`}
              </span>
            </div>

            <div className="space-y-3">
              {!loading && classes.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                  No classes found.
                </div>
              )}

              {classes.map((room) => (
                <button
                  key={room.roomId}
                  onClick={() => setSelectedRoomId(room.roomId)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedRoomId === room.roomId
                      ? "border-cyan-400/50 bg-cyan-400/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{room.roomName}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Code: {room.roomId}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] ${
                        room.meetingActive
                          ? "bg-emerald-400/20 text-emerald-300"
                          : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {room.meetingActive ? "Live" : "Idle"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <main className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
            {!selectedRoom && (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-slate-400">
                Select a class to continue.
              </div>
            )}

            {selectedRoom && (
              <div className="space-y-6">
                <div className="rounded-[24px] border border-white/10 bg-gradient-to-br from-slate-800 to-slate-900 p-6">
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                        Selected class
                      </p>
                      <h2 className="mt-2 text-3xl font-semibold">{selectedRoom.roomName}</h2>
                      <p className="mt-2 text-sm text-slate-400">
                        Room code: {selectedRoom.roomId}
                      </p>
                      {!isTeacher && selectedRoom.teacherEmail && (
                        <p className="mt-1 text-sm text-slate-400">
                          Teacher: {selectedRoom.teacherEmail}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => openClass(selectedRoom)}
                        className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                      >
                        Open Chat
                      </button>

                      {!isTeacher && selectedRoom.meetingActive && (
                        <button
                          onClick={() => handleJoinMeeting(selectedRoom)}
                          className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold transition hover:bg-emerald-400"
                        >
                          Join Meeting
                        </button>
                      )}

                      {isTeacher && (
                        <>
                          {selectedRoom.meetingActive && meetingLinks[selectedRoom.roomId] && (
                            <button
                              onClick={() => handleJoinMeeting(selectedRoom)}
                              className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                            >
                              Open Meeting
                            </button>
                          )}
                          <button
                            onClick={() => handleMeetingToggle(true)}
                            disabled={busyAction === "meeting" || selectedRoom.meetingActive}
                            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold transition hover:bg-emerald-400 disabled:opacity-60"
                          >
                            {busyAction === "meeting" && selectedRoom.meetingActive ? "Working..." : "Start Meeting"}
                          </button>
                          <button
                            onClick={() => handleMeetingToggle(false)}
                            disabled={busyAction === "meeting" || !selectedRoom.meetingActive}
                            className="rounded-2xl bg-rose-500 px-5 py-3 text-sm font-semibold transition hover:bg-rose-400 disabled:opacity-60"
                          >
                            Stop Meeting
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Meeting status
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {selectedRoom.meetingActive ? "Live now" : "Not started"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Online users
                    </p>
                    <p className="mt-2 text-xl font-semibold">{onlineUsers.length}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      {isTeacher ? "Students" : "Teacher"}
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {isTeacher ? members.length : selectedRoom.teacherEmail || "Assigned"}
                    </p>
                  </div>
                </div>

                {isTeacher ? (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
                    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <h3 className="text-xl font-semibold">Create class</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Add another class without leaving the dashboard.
                      </p>

                      <div className="mt-4 flex flex-col gap-3">
                        <input
                          type="text"
                          value={newClassName}
                          onChange={(e) => setNewClassName(e.target.value)}
                          placeholder="Example: Data Structures A"
                          className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-cyan-400"
                        />
                        <button
                          onClick={handleCreateClass}
                          disabled={busyAction === "create-class"}
                          className="rounded-2xl bg-amber-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60"
                        >
                          {busyAction === "create-class" ? "Creating..." : "Create Class"}
                        </button>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <h3 className="text-xl font-semibold">Add student</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Invite a student directly into this class.
                      </p>

                      <div className="mt-4 flex flex-col gap-3">
                        <input
                          type="email"
                          value={studentEmail}
                          onChange={(e) => setStudentEmail(e.target.value)}
                          placeholder="student@college.edu"
                          className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-cyan-400"
                        />
                        <button
                          onClick={handleAddStudent}
                          disabled={busyAction === "add-student"}
                          className="rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
                        >
                          {busyAction === "add-student" ? "Adding..." : "Add Student"}
                        </button>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <h3 className="text-xl font-semibold">Invite options</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Share a class link or add students manually.
                      </p>

                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Invite link
                        </p>
                        <p className="mt-2 break-all text-sm text-slate-200">
                          {selectedRoomInviteLink || "Select a class first"}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          onClick={handleCopyInviteLink}
                          disabled={!selectedRoomInviteLink}
                          className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
                        >
                          Copy Invite Link
                        </button>
                        <button
                          onClick={handleSendInviteLink}
                          disabled={!selectedRoomInviteLink}
                          className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold transition hover:bg-emerald-400 disabled:opacity-60"
                        >
                          Send Invite
                        </button>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-semibold">AI moderation</h3>
                          <p className="mt-1 text-sm text-slate-400">
                            Suspicious messages are suggested here for review.
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">
                          {`${moderationAlerts.length} pending`}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {moderationAlerts.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                            No improper or malicious messages detected right now.
                          </div>
                        )}

                        {moderationAlerts.map((alert) => (
                          <div
                            key={alert.id}
                            className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-sm font-semibold text-white">
                                    {getInitial(alert.senderEmail)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold">
                                      {formatDisplayName(alert.senderName || alert.senderEmail)}
                                    </p>
                                    <p className="truncate text-sm text-slate-300">
                                      {alert.senderEmail}
                                    </p>
                                  </div>
                                </div>

                                <p className="mt-3 text-sm text-amber-200">
                                  {alert.reason}
                                </p>
                                <p className="mt-2 rounded-xl bg-black/20 p-3 text-sm text-slate-100">
                                  {alert.messageContent}
                                </p>
                              </div>

                              <div className="flex shrink-0 flex-col gap-2">
                                <span className="rounded-full bg-amber-400/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-200">
                                  {alert.severity}
                                </span>
                                <button
                                  onClick={() => handleBlockStudent(alert.senderEmail)}
                                  disabled={busyAction === `block-${alert.senderEmail}`}
                                  className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold transition hover:bg-rose-400 disabled:opacity-60"
                                >
                                  {busyAction === `block-${alert.senderEmail}` ? "Blocking..." : "Block Student"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-semibold">Students</h3>
                          <p className="mt-1 text-sm text-slate-400">
                            Block or reactivate students for this class.
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">
                          {membersLoading ? "Loading..." : `${members.length} listed`}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {!membersLoading && members.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                            No students available for this class.
                          </div>
                        )}

                        {members.map((member, index) => {
                          const email =
                            member.email ||
                            member.studentEmail ||
                            member.userEmail ||
                            member;
                          const name = formatDisplayName(
                            member.name ||
                            member.userName ||
                            email ||
                            `Student ${index + 1}`
                          );
                          const blocked =
                            locallyBlockedEmails.includes(email) ||
                            member.blocked ||
                            member.isBlocked ||
                            member.status === "BLOCKED";
                          return (
                            <div
                              key={`${email}-${index}`}
                              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-sm font-semibold text-white">
                                  {getInitial(email)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{name}</p>
                                  <p className="truncate text-sm text-slate-400">
                                    Mail: {email}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] ${
                                    blocked
                                      ? "bg-rose-400/20 text-rose-300"
                                      : "bg-emerald-400/20 text-emerald-300"
                                  }`}
                                >
                                  {blocked ? "Blocked" : "Active"}
                                </span>

                                <button
                                  onClick={() =>
                                    blocked
                                      ? handleActivateStudent(email)
                                      : handleBlockStudent(email)
                                  }
                                  disabled={
                                    busyAction === `block-${email}` ||
                                    busyAction === `activate-${email}`
                                  }
                                  className={`rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                                    blocked
                                      ? "bg-emerald-500 hover:bg-emerald-400"
                                      : "bg-rose-500 hover:bg-rose-400"
                                  }`}
                                >
                                  {busyAction === `block-${email}`
                                    ? "Blocking..."
                                    : busyAction === `activate-${email}`
                                      ? "Activating..."
                                      : blocked
                                        ? "Activate"
                                        : "Block"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                ) : (
                  <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-semibold">Online users</h3>
                        <p className="mt-1 text-sm text-slate-400">
                          People currently active in this class.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {onlineUsers.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                          No online users visible right now.
                        </div>
                      )}

                      {onlineUsers.map((user, index) => {
                        const label = formatDisplayName(user) || `User ${index + 1}`;
                        const sublabel = getDisplayMail(user) || "Active now";
                        return (
                          <div
                            key={`${label}-${index}`}
                            className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-sm font-semibold text-white">
                                {getInitial(sublabel || label)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold">{label}</p>
                                <p className="truncate text-sm text-slate-400">{sublabel}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="hidden text-xs text-slate-400 sm:inline">
                                Active now
                              </span>
                              <span className="h-3 w-3 rounded-full bg-emerald-400" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
