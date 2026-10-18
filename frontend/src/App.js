import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import NewMeeting from "@/pages/NewMeeting";
import MeetingDetail from "@/pages/MeetingDetail";
import ConductMeeting from "@/pages/ConductMeeting";
import AtaEditor from "@/pages/AtaEditor";
import Deliberations from "@/pages/Deliberations";
import KnowledgeBase from "@/pages/KnowledgeBase";
import AdminSettings from "@/pages/AdminSettings";
import Layout from "@/components/Layout";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B1628] gap-4">
      <div className="w-10 h-10 bg-[#0055FF] rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 animate-pulse">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M2 13h4v-3H2v3zm0 4h4v-3H2v3zm0-8h4V6H2v3zm5 4h14v-3H7v3zm0 4h14v-3H7v3zM7 6v3h14V6H7z"/>
        </svg>
      </div>
      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/meetings/new" element={<Protected><NewMeeting /></Protected>} />
            <Route path="/meetings/:id" element={<Protected><MeetingDetail /></Protected>} />
            <Route path="/meetings/:id/conduct" element={<Protected><ConductMeeting /></Protected>} />
            <Route path="/meetings/:id/ata" element={<Protected><AtaEditor /></Protected>} />
            <Route path="/deliberations" element={<Protected><Deliberations /></Protected>} />
            <Route path="/kb" element={<Protected><KnowledgeBase /></Protected>} />
            <Route path="/admin" element={<Protected><AdminSettings /></Protected>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
