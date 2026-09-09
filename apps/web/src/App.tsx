import { useState } from "react";
import { InboxPage } from "./pages/InboxPage.js";
import { loadAuth, saveAuth } from "./state/auth.store.js";
import { ProtectedRoute } from "./components/common/ProtectedRoute.js";

export function App() {
  const [auth, setAuth] = useState(loadAuth());
  if (!auth) return <main><h1>Nhuu Chat</h1><p>Đăng nhập admin/agent để mở inbox.</p><button onClick={() => { const next = { accessToken: window.prompt("Access token") ?? "", refreshToken: "" }; saveAuth(next); setAuth(next); }}>Nhập access token</button></main>;
  return <ProtectedRoute token={auth.accessToken}><InboxPage token={auth.accessToken} /></ProtectedRoute>;
}
