import { useState } from "react";
import { StoreProvider } from "./store";
import type { View } from "./types";
import { Sidebar, Topbar } from "./layout";
import { Dashboard } from "./Dashboard";
import { Sessions } from "./Sessions";
import { Devices } from "./Devices";
import { Users } from "./Users";
import { Billing } from "./Billing";
import { Reports } from "./Reports";
import { Toasts } from "./ui";

function Shell() {
  const [view, setView] = useState<View>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <div className="bg-console" aria-hidden />
      <div className="bg-glow" aria-hidden />

      <Sidebar
        view={view}
        setView={setView}
        mobileOpen={mobileOpen}
        closeMobile={() => setMobileOpen(false)}
      />

      <div className="relative z-10 lg:pl-60">
        <Topbar view={view} openMobile={() => setMobileOpen(true)} />
        <main className="px-4 py-6 sm:px-6">
          <div key={view} className="view-in mx-auto max-w-[1440px]">
            {view === "dashboard" && <Dashboard setView={setView} />}
            {view === "sessions" && <Sessions />}
            {view === "devices" && <Devices />}
            {view === "users" && <Users />}
            {view === "billing" && <Billing />}
            {view === "reports" && <Reports />}
          </div>
        </main>
      </div>

      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
