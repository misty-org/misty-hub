import { useEffect, useState } from "react";
import { Outlet, ScrollRestoration, useLocation, useMatches } from "react-router";
import { HubNavbar } from "./HubNavbar";

type Handle = { title?: string };
const SIDEBAR_STORAGE_KEY = "misty-hub-sidebar-expanded";

export function HubShell() {
  const matches = useMatches();
  const location = useLocation();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    const storedValue = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return storedValue ? storedValue === "true" : true;
  });

  useEffect(() => {
    const titledMatch = [...matches].reverse().find(
      (match) => (match.handle as Handle | undefined)?.title,
    );
    const title = (titledMatch?.handle as Handle | undefined)?.title ?? "Misty Hub";

    if (title) {
      document.title = title;
    }
    window.getSelection()?.removeAllRanges();
  }, [matches]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarExpanded));
  }, [sidebarExpanded]);

  const isAuthPage = location.pathname === "/signin" || location.pathname === "/register";

  return (
    <>
      <ScrollRestoration />
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_22%),linear-gradient(180deg,#07090b,#090c10_58%,#07090b)] text-text">
        {!isAuthPage ? (
          <HubNavbar
            expanded={sidebarExpanded}
            onToggleExpanded={() => setSidebarExpanded((value) => !value)}
          />
        ) : null}
        <main
          className={
            isAuthPage
              ? "min-h-screen"
              : `min-h-screen pt-16 transition-[padding] duration-200 md:pt-0 ${
                  sidebarExpanded ? "md:pl-72" : "md:pl-20"
                }`
          }
        >
          <Outlet />
        </main>
      </div>
    </>
  );
}
