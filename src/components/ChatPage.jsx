import React, { useEffect, useMemo, useRef, useState } from "react";
import { MdAttachFile, MdDoneAll, MdSend } from "react-icons/md";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import toast from "react-hot-toast";
import { useChatContext } from "../context/useChatContext";
import { websocketUrl } from "../config/backend";
import { uploadFileApi } from "../services/FileService";
import {
  getMessagesApi,
  getPrivateMessagesApi,
  getRoomApi,
  getRoomMembersApi,
  getStudentClasses,
  getTeacherClasses
} from "../services/RoomService";
import {
  formatDateTime,
  getSocketTopicKey,
  normalizeEmail
} from "../config/helper";
const fixFileUrl = (url) => {
  if (!url) return "";
  return url.replace(
    "http://localhost:8080",
    "https://chat-app-backend-po82.onrender.com"
  );
};
const TYPING_IDLE_MS = 1200;

const normalizeMessage = (message) => {
  if (!message || typeof message !== "object") return null;
  const sender = normalizeEmail(message.sender || message.email);
  const recipient = normalizeEmail(message.recipient);
  const type = `${message.type || ""}`.toUpperCase() || (message.fileUrl ? "FILE" : "TEXT");

  return {
    ...message,
    id: message.id || `${sender}-${message.timeStamp || Date.now()}`,
    sender,
    recipient,
    type,
    content: message.content || "",
    fileUrl: message.fileUrl
  ? message.fileUrl.replace(
      "http://localhost:8080",
      "https://chat-app-backend-po82.onrender.com"
    )
  : "",
    replyTo: message.replyTo || null,
    privateMessage: Boolean(message.privateMessage),
    timeStamp: message.timeStamp || message.timestamp || null
  };
};

const normalizeMessages = (payload) =>
  (Array.isArray(payload) ? payload : payload?.messages || [])
    .map(normalizeMessage)
    .filter(Boolean);

const upsertMessage = (items, message) => {
  if (!message) return items;
  const index = items.findIndex((item) => item.id === message.id);
  if (index === -1) return [...items, message];
  return items.map((item) => (item.id === message.id ? { ...item, ...message } : item));
};

const shouldNotifyForIncomingRoomMessage = ({
  message,
  currentEmail,
  roomId,
  activeRoomId,
  chatMode
}) => {
  if (!message) return false;
  if (message.sender === currentEmail) return false;
  if (message.type === "MEETING") return false;
  if (roomId !== activeRoomId) return true;
  return chatMode !== "GROUP";
};

const ChatPage = () => {
  const { roomId, setRoomId, currentUserEmail, currentUserRole } = useChatContext();
  const currentEmail = normalizeEmail(currentUserEmail);
  const isTeacher = currentUserRole === "TEACHER";
  const chatBoxRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const lastSeenMessageIdRef = useRef("");
  const [client, setClient] = useState(null);
  const [classes, setClasses] = useState([]);
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [roomMessages, setRoomMessages] = useState([]);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [privateTypingUsers, setPrivateTypingUsers] = useState([]);
  const [seenByMessage, setSeenByMessage] = useState({});
  const [blockedInRoom, setBlockedInRoom] = useState(false);
  const [chatMode, setChatMode] = useState("GROUP");
  const [selectedPeer, setSelectedPeer] = useState("");
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFilePreview, setSelectedFilePreview] = useState("");
  const [sendingFile, setSendingFile] = useState(false);
  const [replyMsg, setReplyMsg] = useState(null);
  const [editMsg, setEditMsg] = useState(null);

  const activeMessages = chatMode === "PRIVATE" ? privateMessages : roomMessages;
  const activeTypingUsers = chatMode === "PRIVATE" ? privateTypingUsers : typingUsers;

  const privatePeers = useMemo(() => {
    if (!room) return [];
    if (!isTeacher) return room.teacherEmail ? [{ email: normalizeEmail(room.teacherEmail), blocked: false }] : [];
    return members.map((member) => ({ email: normalizeEmail(member.email), blocked: Boolean(member.blocked) }));
  }, [isTeacher, members, room]);

  const getName = (email) =>
    (email || "User")
      .split("@")[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const readyClient = () => {
    if (!roomId || !client?.connected) return null;
    if (blockedInRoom && !isTeacher) return null;
    if (chatMode === "PRIVATE" && !selectedPeer) return null;
    return client;
  };

  useEffect(() => {
    if (!currentEmail) return;
    const loadClasses = async () => {
      try {
        const data = isTeacher
          ? await getTeacherClasses(currentEmail)
          : await getStudentClasses(currentEmail);
        setClasses(data || []);
      } catch {
        toast.error("Failed to load classes");
      }
    };
    loadClasses();
  }, [currentEmail, isTeacher]);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setMembers([]);
      setBlockedInRoom(false);
      setPrivateMessages([]);
      return;
    }

    Promise.all([getRoomApi(roomId), getRoomMembersApi(roomId)])
      .then(([roomData, memberData]) => {
        setRoom(roomData);
        setMembers(memberData || []);
        setBlockedInRoom((roomData?.blockedStudents || []).map(normalizeEmail).includes(currentEmail));
        if (!isTeacher && roomData?.teacherEmail) {
          setSelectedPeer(normalizeEmail(roomData.teacherEmail));
        }
      })
      .catch(() => toast.error("Failed to load room details"));
  }, [roomId, currentEmail, isTeacher]);

  useEffect(() => {
    if (!roomId) return;
    getMessagesApi(roomId)
      .then((data) => {
        setRoomMessages(normalizeMessages(data));
        setSeenByMessage({});
        lastSeenMessageIdRef.current = "";
      })
      .catch(() => toast.error("Failed to load messages"));
  }, [roomId]);

  useEffect(() => {
    if (chatMode !== "PRIVATE" || !roomId || !selectedPeer) {
      setPrivateMessages([]);
      return;
    }

    getPrivateMessagesApi(roomId, currentEmail, selectedPeer)
      .then((data) => {
        setPrivateMessages(normalizeMessages(data));
        lastSeenMessageIdRef.current = "";
      })
      .catch(() => toast.error("Failed to load private messages"));
  }, [chatMode, roomId, currentEmail, selectedPeer]);

  useEffect(() => {
    chatBoxRef.current?.scrollTo(0, chatBoxRef.current.scrollHeight);
  }, [activeMessages, activeTypingUsers]);

  useEffect(() => {
    if (!selectedFile) {
      setSelectedFilePreview("");
      return;
    }
    if (!/^(image|video|audio)\//.test(selectedFile.type)) {
      setSelectedFilePreview("");
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setSelectedFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => {
    if (!roomId || !currentEmail) {
      setClient(null);
      return;
    }

    const stompClient = new Client({
      webSocketFactory: () => new SockJS(websocketUrl),
      reconnectDelay: 5000,
      onConnect: () => {
        setClient(stompClient);
        stompClient.subscribe(`/topic/room/${roomId}`, (msg) => {
          const message = normalizeMessage(JSON.parse(msg.body));
          setRoomMessages((prev) => upsertMessage(prev, message));

          if (
            shouldNotifyForIncomingRoomMessage({
              message,
              currentEmail,
              roomId,
              activeRoomId: roomId,
              chatMode
            })
          ) {
            toast(`New group message from ${getName(message.sender)}`);
          }
        });
        stompClient.subscribe(`/topic/edit/${roomId}`, (msg) => {
          setRoomMessages((prev) => upsertMessage(prev, normalizeMessage(JSON.parse(msg.body))));
        });
        stompClient.subscribe(`/topic/delete/${roomId}`, (msg) => {
          setRoomMessages((prev) => prev.filter((item) => `${item.id}` !== `${msg.body}`));
        });
        stompClient.subscribe(`/topic/online/${roomId}`, (msg) => {
          try {
            const payload = JSON.parse(msg.body);
            setOnlineUsers(Array.isArray(payload) ? payload : []);
          } catch {
            setOnlineUsers([]);
          }
        });
        stompClient.subscribe(`/topic/typing/${roomId}`, (msg) => {
          try {
            const payload = JSON.parse(msg.body);
            const user = normalizeEmail(payload.user || payload.sender);
            if (!user || user === currentEmail) return;
            setTypingUsers((prev) => {
              const next = prev.filter((entry) => entry !== user);
              return payload.typing ? [...next, user] : next;
            });
          } catch { }
        });
        stompClient.subscribe(`/topic/seen/${roomId}`, (msg) => {
          try {
            const payload = JSON.parse(msg.body);
            const messageId = payload.messageId;
            const user = normalizeEmail(payload.user || payload.email);
            if (!messageId || !user || user === currentEmail) return;
            setSeenByMessage((prev) => ({
              ...prev,
              [messageId]: [...new Set([...(prev[messageId] || []), user])]
            }));
          } catch { }
        });
        stompClient.subscribe(`/topic/room-events/${roomId}`, (msg) => {
          try {
            const payload = JSON.parse(msg.body);
            const studentEmail = normalizeEmail(payload.studentEmail);
            const blocked = Boolean(payload.blocked);
            setMembers((prev) =>
              prev.map((member) =>
                normalizeEmail(member.email) === studentEmail ? { ...member, blocked } : member
              )
            );
            if (studentEmail === currentEmail) {
              setBlockedInRoom(blocked);
              toast[blocked ? "error" : "success"](blocked ? "You were blocked from this class" : "You were reactivated in this class");
            }
          } catch { }
        });
        stompClient.subscribe(`/topic/notifications/${getSocketTopicKey(currentEmail)}`, (msg) => {
          try {
            const payload = JSON.parse(msg.body);
            const type = payload.type;
            if (type === "PRIVATE_MESSAGE") {
              const message = normalizeMessage(payload.chatMessage);
              setPrivateMessages((prev) => (payload.roomId === roomId ? upsertMessage(prev, message) : prev));
              if (message?.sender !== currentEmail && !(chatMode === "PRIVATE" && [message.sender, message.recipient].includes(selectedPeer) && payload.roomId === roomId)) {
                toast(`New private message from ${getName(message?.sender)}`);
              }
            }
            if (type === "PRIVATE_MESSAGE_UPDATED" && payload.roomId === roomId) {
              setPrivateMessages((prev) => upsertMessage(prev, normalizeMessage(payload.chatMessage)));
            }
            if (type === "PRIVATE_MESSAGE_DELETED" && payload.roomId === roomId) {
              setPrivateMessages((prev) => prev.filter((item) => `${item.id}` !== `${payload.messageId}`));
            }
            if (type === "PRIVATE_MESSAGE_SEEN") {
              const user = normalizeEmail(payload.senderEmail);
              const messageId = payload.messageId;
              if (user && messageId && user !== currentEmail) {
                setSeenByMessage((prev) => ({
                  ...prev,
                  [messageId]: [...new Set([...(prev[messageId] || []), user])]
                }));
              }
            }
            if (
              type === "PRIVATE_TYPING" &&
              payload.roomId === roomId &&
              normalizeEmail(payload.peerEmail) === normalizeEmail(selectedPeer)
            ) {
              const peer = normalizeEmail(payload.peerEmail);
              setPrivateTypingUsers((prev) => {
                const next = prev.filter((entry) => entry !== peer);
                return payload.typing ? [...next, peer] : next;
              });
            }
            if (type === "MODERATION_WARNING") toast.error(payload.message || "Your message was flagged");
            if (type === "MODERATION_ALERT" && payload.roomId === roomId && isTeacher) toast(payload.message || "A message was flagged");
          } catch { }
        });
        stompClient.publish({ destination: `/app/join/${roomId}`, body: currentEmail });
      },
      onDisconnect: () => setClient(null),
      onWebSocketClose: () => setClient(null)
    });

    stompClient.activate();
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      isTypingRef.current = false;
      setClient(null);
      stompClient.deactivate();
    };
  }, [roomId, currentEmail, chatMode, selectedPeer, isTeacher]);

  const publishTyping = (typing) => {
    if (!client?.connected || !roomId) return;
    if (chatMode === "PRIVATE" && selectedPeer) {
      client.publish({
        destination: `/app/privateTyping/${roomId}`,
        body: JSON.stringify({ sender: currentEmail, recipient: selectedPeer, typing })
      });
      return;
    }
    client.publish({
      destination: `/app/typing/${roomId}`,
      body: JSON.stringify({ user: currentEmail, typing })
    });
  };

  useEffect(() => {
    if (!roomId || !activeMessages.length || !client?.connected) return;
    const latestIncoming = [...activeMessages].reverse().find((message) => message.sender !== currentEmail);
    if (!latestIncoming?.id || lastSeenMessageIdRef.current === latestIncoming.id) return;
    lastSeenMessageIdRef.current = latestIncoming.id;
    client.publish({
      destination: `/app/seen/${roomId}`,
      body: JSON.stringify({ messageId: latestIncoming.id, user: currentEmail })
    });
  }, [activeMessages, roomId, currentEmail, client]);

  const handleInputChange = (event) => {
    const value = event.target.value;
    setInput(value);
    if (!client?.connected) return;
    if (value.trim()) {
      if (!isTypingRef.current) {
        publishTyping(true);
        isTypingRef.current = true;
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        publishTyping(false);
        isTypingRef.current = false;
      }, TYPING_IDLE_MS);
    } else if (isTypingRef.current) {
      publishTyping(false);
      isTypingRef.current = false;
    }
  };

  const sendMessage = async () => {
    const activeClient = readyClient();
    if (!activeClient) {
      toast.error(blockedInRoom && !isTeacher ? "You are blocked in this class" : "Chat is not ready");
      return;
    }

    const privateMessage = chatMode === "PRIVATE";
    const payload = {
      sender: currentEmail,
      recipient: privateMessage ? selectedPeer : "",
      privateMessage,
      replyTo: replyMsg?.id
    };

    if (selectedFile) {
      setSendingFile(true);
      try {
        const fileUrl = await uploadFileApi(selectedFile);
        const type = selectedFile.type.startsWith("image")
          ? "IMAGE"
          : selectedFile.type.startsWith("video")
            ? "VIDEO"
            : selectedFile.type.startsWith("audio")
              ? "AUDIO"
              : "FILE";
        activeClient.publish({ destination: `/app/sendMessage/${roomId}`, body: JSON.stringify({ ...payload, fileUrl, type }) });
        setSelectedFile(null);
        setReplyMsg(null);
      } catch {
        toast.error("Failed to upload file");
      } finally {
        setSendingFile(false);
      }
      return;
    }

    if (!input.trim()) return;
    if (editMsg) {
      activeClient.publish({
        destination: `/app/edit/${roomId}`,
        body: JSON.stringify({ messageId: editMsg.id, content: input })
      });
      setEditMsg(null);
    } else {
      activeClient.publish({
        destination: `/app/sendMessage/${roomId}`,
        body: JSON.stringify({ ...payload, content: input, type: "TEXT" })
      });
    }
    setInput("");
    setReplyMsg(null);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) publishTyping(false);
    isTypingRef.current = false;
  };

  const typingLabel = activeTypingUsers.length
    ? activeTypingUsers.length === 1
      ? `${activeTypingUsers[0].split("@")[0]} is typing...`
      : `${activeTypingUsers.length} people are typing...`
    : "";

  return (
    <div className="h-screen flex bg-slate-900 text-white">
      <aside className="w-72 bg-slate-800 p-4 overflow-y-auto border-r border-slate-700/70">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Rooms</p>
        <h2 className="text-xl font-semibold mt-1 mb-4">Your classes</h2>
        {classes.map((item) => (
          <button key={item.roomId} onClick={() => setRoomId(item.roomId)} className={`w-full p-4 mb-3 rounded-2xl text-left transition ${roomId === item.roomId ? "bg-blue-600 shadow-lg shadow-blue-950/50" : "bg-slate-700/80 hover:bg-slate-600"}`}>
            <p className="font-semibold truncate">{item.roomName}</p>
            <p className="text-xs text-gray-300 mt-1">{item.roomId}</p>
          </button>
        ))}
      </aside>

      <section className="flex-1 flex flex-col">
        <header className="px-6 py-4 bg-slate-800/95 border-b border-slate-700/70 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">
              {chatMode === "PRIVATE" && selectedPeer ? `Private chat with ${getName(selectedPeer)}` : roomId ? `Room: ${roomId}` : "Select Class"}
            </h1>
            <p className="text-sm text-slate-300 mt-1 min-h-5">
              {typingLabel || (chatMode === "PRIVATE" ? "Teacher-student private conversation" : `${onlineUsers.length} online`)}
            </p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <p>{currentEmail || "Not connected"}</p>
            {blockedInRoom && !isTeacher && <p className="mt-1 text-rose-300">Blocked in this class</p>}
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <main ref={chatBoxRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950">
            {activeMessages.map((msg) => {
              const isMe = msg.sender === currentEmail;
              const replyToMsg = activeMessages.find((item) => item.id === msg.replyTo);
              const seenUsers = seenByMessage[msg.id] || [];
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`min-w-[280px] max-w-md rounded-2xl px-4 py-3 shadow-sm ${isMe ? "bg-[#dcf8c6] text-slate-900" : "bg-white text-slate-900"}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-orange-700">{getName(msg.sender)}</p>
                      <p className="text-xs text-slate-500">{msg.sender}</p>
                      {msg.privateMessage && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-700">Private</span>}
                    </div>
                    {replyToMsg && <div className="mb-2 rounded-xl border-l-4 border-emerald-500 bg-slate-100 p-2 text-xs text-slate-700">Reply: {replyToMsg.content || "Media"}</div>}
                    {(msg.type === "TEXT" || (!msg.type && msg.content)) && <p>{msg.content}</p>}
                    {msg.type === "IMAGE" && (
                      <img
                        src={fixFileUrl(msg.fileUrl)}
                        className="max-w-xs mt-2 rounded-xl"
                      />
                    )}

                    {msg.type === "VIDEO" && (
                      <video controls className="max-w-xs mt-2 rounded-xl">
                        <source src={fixFileUrl(msg.fileUrl)} />
                      </video>
                    )}

                    {msg.type === "AUDIO" && (
                      <audio controls className="mt-2">
                        <source src={fixFileUrl(msg.fileUrl)} />
                      </audio>
                    )}

                    {msg.type === "FILE" && msg.fileUrl && (
                      <a
                        href={fixFileUrl(msg.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-sm font-medium text-blue-600 underline"
                      >
                        Open attachment
                      </a>
                    )}
                    <div className="mt-3 flex gap-3 text-xs text-slate-500">
                      <button onClick={() => setReplyMsg(msg)}>Reply</button>
                      {isMe && <button onClick={() => { setEditMsg(msg); setInput(msg.content || ""); }}>Edit</button>}
                      {isMe && <button onClick={() => readyClient()?.publish({ destination: `/app/delete/${roomId}`, body: msg.id })}>Delete</button>}
                    </div>
                    <div className={`mt-2 flex items-center gap-2 text-[11px] text-slate-500 ${isMe ? "justify-end" : "justify-start"}`}>
                      <span>{formatDateTime(msg.timeStamp)}</span>
                      {isMe && seenUsers.length > 0 && <span className="inline-flex items-center gap-1 text-emerald-600"><MdDoneAll />Seen by {seenUsers.length}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </main>

          <aside className="w-80 border-l border-slate-700/70 bg-slate-800/90 p-4 overflow-y-auto">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setChatMode("GROUP"); setPrivateTypingUsers([]); }} className={`rounded-xl px-3 py-2 text-sm font-semibold ${chatMode === "GROUP" ? "bg-cyan-400 text-slate-950" : "bg-slate-700"}`}>Group chat</button>
                <button onClick={() => { setChatMode("PRIVATE"); setSelectedPeer((prev) => prev || privatePeers[0]?.email || ""); setPrivateTypingUsers([]); }} disabled={!privatePeers.length} className={`rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-60 ${chatMode === "PRIVATE" ? "bg-amber-400 text-slate-950" : "bg-slate-700"}`}>Private</button>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
              <h3 className="text-lg font-semibold">{chatMode === "PRIVATE" ? "Direct messages" : "Participants"}</h3>
              <div className="mt-4 space-y-3">
                {(chatMode === "PRIVATE" ? privatePeers : onlineUsers.map((email) => ({ email }))).map((entry) => (
                  <button key={entry.email} onClick={() => chatMode === "PRIVATE" && setSelectedPeer(entry.email)} className={`w-full rounded-2xl border p-3 text-left transition ${chatMode === "PRIVATE" && selectedPeer === entry.email ? "border-amber-400/60 bg-amber-400/10" : "border-slate-700 bg-slate-800"}`}>
                    <p className="font-semibold truncate">{getName(entry.email)}</p>
                    <p className="truncate text-xs text-slate-400 mt-1">{entry.email}</p>
                    {entry.blocked && <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-rose-300">Blocked student</p>}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {replyMsg && <div className="bg-slate-800 mx-4 mb-3 px-4 py-3 rounded-2xl border border-slate-700 flex justify-between gap-3"><div className="min-w-0"><p className="text-xs uppercase tracking-wider text-slate-400">Replying</p><p className="text-sm truncate">{replyMsg.content || "Media"}</p></div><button onClick={() => setReplyMsg(null)} className="text-slate-300">Cancel</button></div>}
        {selectedFile && <div className="bg-slate-800 mx-4 mb-3 px-4 py-3 rounded-2xl border border-slate-700"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">File ready to send</p><p className="text-xs text-slate-300 truncate mt-1">{selectedFile.name}</p></div><button onClick={() => setSelectedFile(null)} className="text-sm text-slate-300 hover:text-white" disabled={sendingFile}>Remove</button></div>{selectedFilePreview && <div className="mt-3">{selectedFile.type.startsWith("image/") && <img src={selectedFilePreview} alt={selectedFile.name} className="max-h-52 rounded-xl" />}{selectedFile.type.startsWith("video/") && <video controls src={selectedFilePreview} className="max-h-52 rounded-xl w-full" />}{selectedFile.type.startsWith("audio/") && <audio controls src={selectedFilePreview} className="w-full" />}</div>}</div>}

        <div className="bg-slate-800 border-t border-slate-700/70 p-4">
          <div className="mb-3 text-xs text-slate-400">{chatMode === "PRIVATE" && selectedPeer ? `Private chat with ${selectedPeer}` : "Messages here are visible to the whole class"}</div>
          <div className="flex gap-3 items-end">
            <input value={input} onChange={handleInputChange} placeholder={blockedInRoom && !isTeacher ? "You are blocked in this class" : chatMode === "PRIVATE" ? "Type a private message..." : "Type message..."} disabled={!roomId || (blockedInRoom && !isTeacher)} className="flex-1 px-4 py-3 rounded-2xl bg-slate-700 outline-none border border-slate-600 focus:border-blue-400 disabled:opacity-60" />
            <input type="file" id="filePicker" className="hidden" onChange={(event) => setSelectedFile(event.target.files[0] || null)} />
            <button onClick={() => document.getElementById("filePicker").click()} disabled={!roomId || !client?.connected || (blockedInRoom && !isTeacher)} className="bg-slate-700 hover:bg-slate-600 p-3 rounded-2xl transition disabled:opacity-60"><MdAttachFile /></button>
            <button onClick={sendMessage} disabled={sendingFile || !roomId || !client?.connected || (blockedInRoom && !isTeacher) || (chatMode === "PRIVATE" && !selectedPeer)} className="bg-emerald-600 hover:bg-emerald-500 p-3 rounded-2xl transition disabled:opacity-60"><MdSend /></button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ChatPage;
