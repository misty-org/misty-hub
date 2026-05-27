import { Outlet, useLocation } from "react-router";
import { AccountMenu } from "./AccountMenu";
import { LoggerPanel } from "./LoggerPanel";

export function AppFrame() {
  const { pathname } = useLocation();
  const isInstallPage = pathname === "/";
  const isAuthPage = pathname === "/signin" || pathname === "/register";

  return (
    <main className="h-screen overflow-hidden bg-bg text-text app-backdrop">
      <section
        className={`relative mx-auto flex h-screen w-full flex-col ${
          isInstallPage
            ? "max-w-[660px] px-5 pb-5 pt-6 sm:px-6"
            : "max-w-none overflow-y-auto"
        }`}
      >
        {!isAuthPage && <AccountMenu />}
        {isInstallPage ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        ) : (
          <Outlet />
        )}
        {isInstallPage && <LoggerPanel />}
      </section>
    </main>
  );
}
