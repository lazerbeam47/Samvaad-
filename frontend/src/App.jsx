import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LiveCall from "./components/liveCall.jsx";
import SamvaadHome from "./homepage.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/homepage" element={<SamvaadHome />} />
        <Route path="/demo" element={<LiveCall />} />
        <Route path="/" element={<Navigate to="/homepage" replace />} />
        <Route path="*" element={<Navigate to="/homepage" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
