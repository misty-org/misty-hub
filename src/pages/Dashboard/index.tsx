import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "../../AuthContext";
import { useUserStore } from "../../store/userStore";
import { fetchMe, updateDevice, updateProfile, type MeResponse } from "./api";

const TIER_LABEL: Record<string, string> = { free: "Lite", pro: "Pro", max: "Max" };
const TIER_COLOR: Record<string, string> = {
  free: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
  pro: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  max: "text-violet-400 bg-violet-400/10 border-violet-400/20",
};
const STATUS_COLOR: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  cancelled: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  expired: "text-red-400 bg-red-400/10 border-red-400/20",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function isUnauthorized(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && error.status === 401;
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-text-muted">{title}</p>
      <div className="divide-y divide-border/60 border-y border-border/70">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-4 md:flex-row md:items-center md:justify-between md:gap-6">
      <span className="text-sm text-text-muted">{label}</span>
      <div className="text-sm text-text md:text-right">{children}</div>
    </div>
  );
}

function GhostRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 opacity-40 md:flex-row md:items-center md:justify-between md:gap-6">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm italic text-text-muted md:text-right">{value}</span>
    </div>
  );
}

function useSave(fn: () => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    setOk(false);
    try {
      await fn();
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return { saving, error, ok, save };
}

function SaveFeedback({ ok, error }: { ok: boolean; error: string }) {
  if (ok) return <p className="mt-2 text-xs text-emerald-400">Saved.</p>;
  if (error) return <p className="mt-2 text-xs text-red-400">{error}</p>;
  return null;
}

type Tab = "general" | "account" | "privacy";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "account", label: "Account" },
  { id: "privacy", label: "Privacy" },
];

function SettingsNav({
  tab,
  onSelect,
  showTitle = true,
}: {
  tab: Tab;
  onSelect: (tab: Tab) => void;
  showTitle?: boolean;
}) {
  return (
    <>
      {showTitle && <p className="mb-4 px-3 text-xl font-semibold text-text">Settings</p>}
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            tab === id ? "bg-elevated font-medium text-text" : "text-text-muted hover:bg-elevated/50 hover:text-text"
          }`}
        >
          {label}
        </button>
      ))}
    </>
  );
}

function GeneralPanel() {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Appearance">
        <Row label="Theme">System</Row>
        <Row label="Language">English</Row>
        <GhostRow label="Density" value="Coming soon" />
      </Section>

      <Section title="App">
        <Row label="Version">
          <span className="font-mono text-xs text-text-muted">v0.1.0-beta</span>
        </Row>
        <Row label="Release channel">Stable</Row>
        <GhostRow label="Check for updates" value="Coming soon" />
        <GhostRow label="Auto-update" value="Coming soon" />
      </Section>

      <Section title="Notifications">
        <GhostRow label="Product updates" value="Coming soon" />
        <GhostRow label="Release notes emails" value="Coming soon" />
        <Row label="Security emails">Always on</Row>
      </Section>
    </div>
  );
}

function AccountPanel({
  me,
  onUpdated,
  onLogout,
}: {
  me: MeResponse;
  onUpdated: (name: string) => void;
  onLogout: () => void;
}) {
  const { patchMe } = useUserStore();
  const [name, setName] = useState(me.name);
  const [device, setDevice] = useState(me.license_device);
  const {
    saving: savingProfile,
    error: profileError,
    ok: profileOk,
    save: saveProfile,
  } = useSave(async () => {
    await updateProfile(name);
    onUpdated(name);
  });
  const {
    saving: savingDevice,
    error: deviceError,
    ok: deviceOk,
    save: saveDevice,
  } = useSave(async () => {
    await updateDevice(device);
    patchMe({ license_device: device });
  });

  const joined = new Date(me.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const initialsSource = name.trim() || me.name || me.email;
  const initials = initialsSource
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex flex-col gap-6">
      <Section title="License">
        <Row label="Plan">
          <Badge label={TIER_LABEL[me.tier] ?? me.tier} cls={TIER_COLOR[me.tier] ?? TIER_COLOR.free} />
        </Row>
        <Row label="Status">
          <Badge
            label={me.status.charAt(0).toUpperCase() + me.status.slice(1)}
            cls={STATUS_COLOR[me.status] ?? STATUS_COLOR.active}
          />
        </Row>
        <Row label="Type">{me.tier === "free" ? "Free forever" : "Perpetual"}</Row>
        {me.expires_at ? (
          <Row label="Expires">
            {new Date(me.expires_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Row>
        ) : me.tier !== "free" ? (
          <Row label="Expires">Never</Row>
        ) : null}
      </Section>

      <Section title="Devices">
        <div className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="space-y-1">
            <p className="text-sm text-text">Licensed device</p>
            <p className="text-xs text-text-muted">Change the machine name registered to your license.</p>
          </div>
          <div className="w-full md:max-w-sm">
            <div className="flex gap-2">
              <input
                type="text"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="e.g. MacBook Pro"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:border-white/30 focus:outline-none"
              />
              <button
                onClick={saveDevice}
                disabled={savingDevice}
                className="shrink-0 cursor-pointer rounded-lg bg-white px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingDevice ? "Saving…" : "Save"}
              </button>
            </div>
            <SaveFeedback ok={deviceOk} error={deviceError} />
          </div>
        </div>

        <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between md:gap-6">
          <div>
            <p className="text-sm font-medium text-text">{me.license_device || "Primary device"}</p>
            <p className="mt-0.5 text-xs text-text-muted">{TIER_LABEL[me.tier] ?? me.tier} · Activated</p>
          </div>
          <Badge label="Active" cls={STATUS_COLOR.active} />
        </div>

        {me.tier === "max" && (
          <div className="py-4">
            <p className="text-xs text-text-muted">Additional seats appear here as you activate new devices.</p>
          </div>
        )}

        {me.tier === "free" && (
          <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between md:gap-6">
            <p className="text-xs text-text-muted">Pro - $30 per device · Max - $89 unlimited devices</p>
            <a href="/pricing" className="shrink-0 text-xs text-text underline underline-offset-2 transition-colors hover:text-white">
              Upgrade
            </a>
          </div>
        )}
      </Section>

      <Section title="Billing">
        <GhostRow label="Payment method" value="Not connected" />
        <GhostRow label="Last payment" value="—" />
        <GhostRow label="Next invoice" value="—" />
        <div className="py-4 opacity-40">
          <button className="cursor-not-allowed text-sm text-text-muted">Manage billing →</button>
        </div>
      </Section>

      <Section title="Info">
        <div className="flex flex-col gap-4 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-full border border-border bg-elevated text-lg font-bold text-text">
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium text-text">{me.name}</p>
              <p className="mt-0.5 text-xs text-text-muted">{me.email}</p>
              <p className="mt-1 text-xs text-text-muted/50">Photo upload — coming soon</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <label className="mb-1.5 block text-xs text-text-muted">Display name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:border-white/30 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveProfile}
                disabled={savingProfile || name.trim() === "" || name === me.name}
                className="cursor-pointer rounded-lg bg-white px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingProfile ? "Saving…" : "Save changes"}
              </button>
              <SaveFeedback ok={profileOk} error={profileError} />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Email</label>
            <input
              type="email"
              value={me.email}
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm text-text-muted"
            />
            <p className="mt-1 text-xs text-text-muted/60">Email cannot be changed.</p>
          </div>
        </div>

        <Row label="Member since">{joined}</Row>
        <Row label="User id">
          <span className="font-mono text-xs text-text-muted">{me.id}</span>
        </Row>
      </Section>

      <Section title="Security">
        <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between md:gap-6">
          <div>
            <p className="text-sm text-text">Password</p>
            <p className="mt-0.5 text-xs text-text-muted">Reset via email link.</p>
          </div>
          <a href="/signin" className="text-sm text-text-muted underline underline-offset-2 transition-colors hover:text-text">
            Reset
          </a>
        </div>
        <GhostRow label="Two-factor authentication" value="Coming soon" />
        <GhostRow label="Active sessions" value="Coming soon" />
      </Section>

      <Section title="Danger Zone">
        <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between md:gap-6">
          <div>
            <p className="text-sm text-text">Sign out</p>
            <p className="mt-0.5 text-xs text-text-muted">End your session on this device.</p>
          </div>
          <button onClick={onLogout} className="text-sm text-text-muted transition-colors hover:text-red-400">
            Sign out
          </button>
        </div>
        <div className="flex flex-col gap-3 py-4 opacity-40 md:flex-row md:items-center md:justify-between md:gap-6">
          <div>
            <p className="text-sm text-text">Delete account</p>
            <p className="mt-0.5 text-xs text-text-muted">Permanently remove your account and all data.</p>
          </div>
          <button className="cursor-not-allowed text-sm text-text-muted">Delete</button>
        </div>
      </Section>
    </div>
  );
}

function PrivacyPanel() {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Privacy">
        <div className="flex flex-col gap-2 py-4">
          <p className="text-sm font-medium text-text">Your data stays on your device.</p>
          <p className="text-sm leading-relaxed text-text-muted">
            Misty never transmits your files or cloud credentials to any external server. All provider communication runs through a local proxy
            on your machine. We only store your account info (name, email, hashed password) and subscription status.
          </p>
          <a href="/docs" className="mt-1 w-fit text-xs text-text-muted underline underline-offset-2 transition-colors hover:text-text">
            Read the architecture docs →
          </a>
        </div>
      </Section>

      <Section title="Legal">
        <GhostRow label="Privacy Policy" value="Coming soon" />
        <GhostRow label="Terms of Service" value="Coming soon" />
        <GhostRow label="License Agreement" value="Coming soon" />
      </Section>

      <Section title="Data">
        <div className="flex flex-col gap-3 py-4 opacity-40 md:flex-row md:items-center md:justify-between md:gap-6">
          <div>
            <p className="text-sm text-text">Export your data</p>
            <p className="mt-0.5 text-xs text-text-muted">Download a copy of your account data.</p>
          </div>
          <button className="cursor-not-allowed text-sm text-text-muted">Export</button>
        </div>
      </Section>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const { me, loading, setMe, setLoading, patchMe } = useUserStore();
  const [tab, setTab] = useState<Tab>("general");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/signin", { replace: true });
      return;
    }
    if (me) return;
    setLoading(true);
    fetchMe()
      .then(setMe)
      .catch((err: unknown) => {
        if (isUnauthorized(err)) logout();
      })
      .finally(() => setLoading(false));
  }, [user, navigate, logout, me, setMe, setLoading]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  if (!user || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-text-muted" />
      </div>
    );
  }

  return (
    <div className="pt-0 md:pt-16">
      <div className="mx-auto flex max-w-4xl">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-48 shrink-0 flex-col gap-1 self-start border-r border-border px-3 py-8 md:flex">
          <SettingsNav tab={tab} onSelect={setTab} />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="max-w-xl px-6 pb-12 pt-5 sm:px-8 md:py-8 md:pb-12">
            <div className="mb-6 flex items-center gap-3">
              <button
                aria-label="Open settings navigation"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition hover:bg-elevated hover:text-text md:hidden"
                onClick={() => setDrawerOpen(true)}
                type="button"
              >
                <Menu aria-hidden="true" className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-bold tracking-tight text-text">{TABS.find((currentTab) => currentTab.id === tab)?.label}</h1>
            </div>

            {tab === "general" && <GeneralPanel />}

            {me && tab === "account" && (
              <AccountPanel
                me={me}
                onUpdated={(name) => {
                  patchMe({ name });
                  setUser({ ...user, name });
                }}
                onLogout={logout}
              />
            )}

            {tab === "privacy" && <PrivacyPanel />}
          </div>
        </main>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Settings navigation">
          <button
            aria-label="Close settings navigation"
            className="absolute inset-0 h-full w-full bg-black/55"
            onClick={() => setDrawerOpen(false)}
            type="button"
          />
          <aside className="relative flex h-full w-72 max-w-[82vw] flex-col border-r border-border bg-bg px-3 py-4 shadow-2xl shadow-black/50">
            <div className="mb-4 flex h-9 items-center justify-between px-3">
              <span className="text-sm font-medium text-text-muted">Settings</span>
              <button
                aria-label="Close settings navigation"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-elevated hover:text-text"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <SettingsNav
              tab={tab}
              showTitle={false}
              onSelect={(nextTab) => {
                setTab(nextTab);
                setDrawerOpen(false);
              }}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
