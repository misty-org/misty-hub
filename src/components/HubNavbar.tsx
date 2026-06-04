import { BookOpen, Gauge, GripVertical, Home, Package2, User2 } from "lucide-react";
import { FaDiscord, FaGithub } from "react-icons/fa";
import { MdOutlineEmail } from "react-icons/md";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { useAuth } from "../AuthContext";
import { useSetupStore } from "../store/useSetupStore";
import { useUserStore } from "../store/userStore";

const navLinks = [
  { label: "Home", to: "/", icon: Home, exact: true },
  { label: "Dashboard", to: "/dashboard", icon: Gauge },
  { label: "Docs", to: "/docs", icon: BookOpen },
  { label: "Plugins", to: "/plugins", icon: Package2 },
];

const communityLinks = [
  { label: "Discord", href: "https://discord.gg/your-invite", icon: FaDiscord },
  { label: "GitHub", href: "https://github.com/kannachi323", icon: FaGithub },
  { label: "Email", href: "mailto:hello@misty.app", icon: MdOutlineEmail },
];

const SIDEBAR_TRANSITION_MS = 200;

function railLinkClass(isActive: boolean, expanded: boolean) {
  return `group flex items-center rounded-2xl text-sm font-medium transition-all duration-200 ${
    expanded ? "h-11 gap-3 px-4" : "h-12 w-12 justify-center"
  } ${
    isActive
      ? "bg-white/[0.08] text-white"
      : "text-text-muted hover:bg-white/[0.05] hover:text-white"
  }`;
}

type HubNavbarProps = {
  expanded: boolean;
  onToggleExpanded: () => void;
};

export function HubNavbar({ expanded, onToggleExpanded }: HubNavbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { status } = useSetupStore();
  const { user, logout } = useAuth();
  const { me } = useUserStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const [showExpandedContent, setShowExpandedContent] = useState(expanded);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const currentUser = status?.current_user ?? null;
  const account = currentUser ?? user;
  const displayName = me?.name ?? account?.name ?? "";
  const initials = displayName
    ? displayName
        .split(" ")
        .map((word) => word[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (account?.email?.[0]?.toUpperCase() ?? "");

  useEffect(() => {
    if (!expanded) {
      const timeoutId = window.setTimeout(() => {
        setShowExpandedContent(false);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      setShowExpandedContent(true);
    }, SIDEBAR_TRANSITION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [expanded]);

  useEffect(() => {
    if (!profileOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [profileOpen]);

  return (
    <>
      <aside
        className={`glass fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/40 transition-[width] duration-200 md:flex ${
          expanded ? "w-72" : "w-20"
        }`}
      >
        <button
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="absolute top-1/2 right-0 flex h-9 w-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-[#12161a] text-[#d4d4d8] shadow-lg shadow-black/25 transition hover:border-white/20 hover:bg-[#171b20] hover:text-white"
          onClick={onToggleExpanded}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className={`flex h-full flex-col py-4 ${showExpandedContent ? "px-5" : "px-3"}`}>
          <div className={`flex items-center ${showExpandedContent ? "justify-between gap-3" : "justify-center"}`}>
            <Link
              aria-label="Misty Hub Home"
              className={`flex min-w-0 items-center transition hover:text-white ${
                showExpandedContent ? "gap-1.5" : "justify-center"
              }`}
              title={showExpandedContent ? undefined : "Misty Hub"}
              to="/"
            >
              <img
                alt="Misty Hub logo"
                className="h-11 w-11 shrink-0"
                src="/misty-hub.png"
              />
              {showExpandedContent ? (
                <span className="flex min-w-0 items-end gap-0.5 leading-none">
                  <span className="text-[34px] font-semibold tracking-tight text-text">
                    Misty
                  </span>
                  <span className="pb-1 text-[0.72rem] font-semibold text-text-muted/75">
                    Hub
                  </span>
                </span>
              ) : null}
            </Link>
          </div>

          <div className={`mt-8 flex flex-col gap-2 ${showExpandedContent ? "" : "items-center"}`}>
            {navLinks.map(({ label, to, icon: Icon, exact }) => (
              <NavLink
                aria-label={label}
                key={label}
                className={({ isActive }) =>
                  railLinkClass(exact ? location.pathname === to : isActive, showExpandedContent)
                }
                title={showExpandedContent ? undefined : label}
                to={to}
              >
                <Icon className={`${showExpandedContent ? "h-4 w-4" : "h-5 w-5"} shrink-0`} />
                {showExpandedContent ? <span className="truncate">{label}</span> : null}
              </NavLink>
            ))}
          </div>

          <div className="mt-auto pt-6">
            <div
              className={`flex border-t border-white/8 pt-4 ${
                showExpandedContent ? "items-center justify-center gap-3" : "flex-col items-center gap-4"
              }`}
            >
              {showExpandedContent ? (
                <span className="text-sm text-text-muted">
                Join our community
                </span>
              ) : null}
              {showExpandedContent ? <div className="h-4 w-px bg-white/10" /> : null}
              <div className={`flex items-center ${showExpandedContent ? "gap-3" : "flex-col gap-3"}`}>
                {communityLinks.map(({ href, icon: Icon, label }) => (
                  <a
                    aria-label={label}
                    className={`flex items-center justify-center text-text-muted transition-colors hover:text-zinc-200 ${
                      showExpandedContent ? "" : "h-12 w-12 rounded-2xl hover:bg-white/[0.05]"
                    }`}
                    href={href}
                    key={label}
                    rel="noreferrer"
                    target="_blank"
                    title={showExpandedContent ? undefined : label}
                  >
                    <Icon className={showExpandedContent ? "h-5 w-5" : "h-6 w-6"} />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4" ref={profileMenuRef}>
            {account ? (
              <div className="relative">
                <button
                  aria-label="Account menu"
                  className={`flex w-full items-center border-t border-white/8 py-4 text-left transition hover:bg-white/[0.03] ${
                    showExpandedContent ? "gap-3 px-2" : "justify-center px-0"
                  }`}
                  onClick={() => setProfileOpen((value) => !value)}
                  title={showExpandedContent ? undefined : (displayName || account.email || "Account")}
                  type="button"
                >
                  <span className={`flex items-center justify-center bg-white font-semibold text-black ${
                    showExpandedContent ? "h-11 w-11 rounded-2xl text-sm" : "h-12 w-12 rounded-2xl text-base"
                  }`}>
                    {initials}
                  </span>
                  {showExpandedContent ? (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-text">
                          {displayName || "Misty account"}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {account.email}
                        </span>
                      </span>
                      <User2 className="h-4 w-4 shrink-0 text-text-muted" />
                    </>
                  ) : null}
                </button>

                {profileOpen ? (
                  <div
                    className={
                      showExpandedContent
                        ? "absolute bottom-full left-0 right-0 mb-3"
                        : "absolute bottom-0 left-full ml-3 w-48"
                    }
                  >
                    <div className="glass-card overflow-hidden rounded-2xl shadow-xl shadow-black/30">
                      <Link
                        className="block px-4 py-3 text-sm text-text-muted transition hover:bg-white/[0.04] hover:text-text"
                        onClick={() => setProfileOpen(false)}
                        to="/account"
                      >
                        Account
                      </Link>
                      <button
                        className="w-full border-t border-border/30 px-4 py-3 text-left text-sm text-text-muted transition hover:bg-white/[0.04] hover:text-text"
                        onClick={logout}
                        type="button"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : showExpandedContent ? (
              <button
                className="w-full rounded-[1.5rem] bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
                onClick={() =>
                  navigate("/signin", { state: { from: location.pathname } })
                }
                type="button"
              >
                Sign In
              </button>
            ) : (
              <button
                aria-label="Sign in"
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black transition hover:bg-zinc-200"
                onClick={() =>
                  navigate("/signin", { state: { from: location.pathname } })
                }
                title="Sign in"
                type="button"
              >
                <User2 className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
