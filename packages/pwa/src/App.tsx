import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Dispatch from "./pages/Dispatch";
import Sessions from "./pages/Sessions";
import Chat from "./pages/Chat";
import Workspaces from "./pages/Workspaces";
import SessionDetail from "./pages/SessionDetail";
import WorkspaceFiles from "./pages/WorkspaceFiles";

export default function App() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <Login />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/dispatch" element={<Dispatch />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/chat/:sessionId" element={<Chat />} />
          <Route path="/workspaces" element={<Workspaces />} />
          <Route path="/workspace/:workspaceId/session/:sessionId" element={<SessionDetail />} />
          <Route path="/workspace/:workspaceId/files" element={<WorkspaceFiles />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
