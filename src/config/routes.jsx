import React from "react";
import { Routes, Route } from "react-router-dom";
import App from "../App";
import ChatPage from "../components/ChatPage";
import Dashboard from "../pages/Dashboard";
const AppRoutes = () => {
  return (
    <Routes>

      {/* Login / Join Page */}
      <Route path="/" element={<App />} />

      {/* Chat Room */}
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/dashboard" element={<Dashboard />} />

      {/* About Page */}
      <Route path="/about" element={<h1>This is about page</h1>} />

      {/* 404 */}
      <Route path="*" element={<h1>404 Page Not Found</h1>} />

    </Routes>
  );
};

export default AppRoutes;