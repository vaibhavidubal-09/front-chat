import { createContext, useState } from "react";

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [roomId, setRoomId] = useState("");
  const [currentUser, setCurrentUser] = useState(localStorage.getItem("currentUser") || "");
  const [currentUserEmail, setCurrentUserEmail] = useState(localStorage.getItem("currentUserEmail") || "");
  const [currentUserRole, setCurrentUserRole] = useState(localStorage.getItem("currentUserRole") || "STUDENT");
  const [connected, setConnected] = useState(false);
  const [authToken, setAuthToken] = useState(localStorage.getItem("authToken") || "");

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
        setConnected,
        authToken,
        setAuthToken
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export default ChatContext;
