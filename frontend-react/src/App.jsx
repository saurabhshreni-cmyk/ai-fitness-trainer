import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import TrainerPage from "./pages/Trainer";
import HistoryPage from "./pages/History";
import SettingsPage from "./pages/Settings";
import "./index.css";
import "./App.css";

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TrainerPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
