import { BookOpen, Home, Package2, User2 } from "lucide-react";
import { FaDiscord, FaGithub } from "react-icons/fa";
import { MdOutlineEmail } from "react-icons/md";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { useAuth } from "../AuthContext";
import { useSetupStore } from "../store/useSetupStore";
import { useUserStore } from "../store/userStore";

const navLinks = [
  { label: "Home", to: "/", icon: Home, exact: true },
  { label: "Docs", to: "/docs", icon: BookOpen },
  { label: "Plugins", to: "/plugins", icon: Package2 },
];

const communityLinks = [
  { label: "Discord", href: "https://discord.gg/your-invite", icon: FaDiscord },
  { label: "GitHub", href: "https://github.com/kannachi323", icon: FaGithub },
  { label: "Email", href: "mailto:hello@misty.app", icon: MdOutlineEmail },
];

function railLinkClass(isActive: boolean) {
  return `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
    isActive
      ? "bg-white/[0.08] text-white"
      : "text-text-muted hover:bg-white/[0.05] hover:text-white"
  }`;
}

export function HubNavbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status } = useSetupStore();
  const { user, logout } = useAuth();
  const { me } = useUserStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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
    setMenuOpen(false);
    setProfileOpen(false);
  }, [location]);

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
      <aside className="glass fixed inset-y-0 left-0 z-40 w-72 flex-col border-r border-border/40 md:flex">
        <div className="flex h-full flex-col px-5 py-4">
          <Link
            className="flex items-center gap-1.5 transition hover:text-white"
            to="/"
          >
            <img
              alt="Misty Hub logo"
              className="h-11 w-11"
              src="/misty-hub.png"
            />
            <span className="flex items-end gap-0.5 leading-none">
              <span className="text-[34px] font-semibold tracking-tight text-text">
                Misty
              </span>
              <span className="pb-1 text-[0.72rem] font-semibold text-text-muted/75">
                Hub
              </span>
            </span>
          </Link>

          <div className="mt-8 flex flex-col gap-2">
            {navLinks.map(({ label, to, icon: Icon, exact }) => (
              <NavLink
                key={label}
                className={({ isActive }) =>
                  railLinkClass(exact ? location.pathname === to : isActive)
                }
                to={to}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>

          <div className="mt-auto pt-6">
            <div className="flex items-center justify-center gap-3 border-t border-white/8 pt-4">
              <span className="text-sm text-text-muted">
                Join our community
              </span>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-3">
                {communityLinks.map(({ href, icon: Icon, label }) => (
                  <a
                    aria-label={label}
                    className="text-text-muted transition-colors hover:text-zinc-200"
                    href={href}
                    key={label}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4" ref={profileMenuRef}>
            {account ? (
              <div className="relative">
                <button
                  className="flex w-full items-center gap-3 border-t border-white/8 px-2 py-4 text-left transition hover:bg-white/[0.03]"
                  onClick={() => setProfileOpen((value) => !value)}
                  type="button"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-sm font-semibold text-black">
                    {initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text">
                      {displayName || "Misty account"}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {account.email}
                    </span>
                  </span>
                  <User2 className="h-4 w-4 text-text-muted" />
                </button>

                {profileOpen ? (
                  <div className="absolute bottom-full left-0 right-0 mb-3">
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
            ) : (
              <button
                className="w-full rounded-[1.5rem] bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
                onClick={() =>
                  navigate("/signin", { state: { from: location.pathname } })
                }
                type="button"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
