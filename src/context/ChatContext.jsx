import { createContext, useState } from "react";

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {

  const [roomId, setRoomId] = useState("");
  const [currentUser, setCurrentUser] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("STUDENT"); // ✅ default
  const [connected, setConnected] = useState(false);

  return (
    <ChatContext.Provider
      value={{
        roomId,
        setRoomId,

        currentUser,
        setCurrentUser,

        currentUserEmail,
        setCurrentUserEmail,

        currentUserRole,
        setCurrentUserRole,

        connected,
        setConnected
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export default ChatContext;
