import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./app.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";
type Workspace = { id: string; name: string; role: string };
type User = { id: string; name: string; email: string };
type Lead = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
};
type Campaign = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  _count?: { sequences: number };
};
type Template = { id: string; name: string; subject: string; bodyText: string };
type Sequence = {
  id: string;
  name: string;
  campaign: { id: string; name: string; status: string };
  steps: {
    id: string;
    position: number;
    delayMinutes: number;
    template: { name: string; subject: string };
  }[];
  _count?: { enrollments: number };
};
type ApiError = { error?: { message?: string } };
let liveAccessToken = "";

async function request<T>(
  path: string,
  token?: string,
  options: RequestInit = {},
): Promise<T> {
  const send = (accessToken?: string) =>
    fetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  let response = await send(liveAccessToken || token);
  if (
    response.status === 401 &&
    (liveAccessToken || token) &&
    !path.startsWith("/auth/")
  ) {
    const refreshed = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) {
      liveAccessToken = ((await refreshed.json()) as { accessToken: string })
        .accessToken;
      response = await send(liveAccessToken);
    }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    throw new Error(
      body.error?.message ?? `Request failed (${response.status})`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function AuthScreen({
  onSignedIn,
}: {
  onSignedIn: (token: string, user: User, workspaces: Workspace[]) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request<{
        accessToken: string;
        user: User;
        workspaces: Workspace[];
      }>(`/auth/${mode === "signup" ? "signup" : "login"}`, undefined, {
        method: "POST",
        body: JSON.stringify(
          mode === "signup"
            ? { name, email, password, workspaceName }
            : { email, password },
        ),
      });
      onSignedIn(result.accessToken, result.user, result.workspaces);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-screen">
      <div className="auth-aside">
        <a className="brand" href="#home">
          <span className="brand-icon">s.</span>
          <span>
            sequence<span className="brand-os">OS</span>
          </span>
        </a>
        <div className="auth-story">
          <span className="auth-kicker">OUTREACH, WITH INTENTION</span>
          <h1>
            Make every
            <br />
            touchpoint
            <br />
            <em>count.</em>
          </h1>
          <p>A calmer way to build meaningful conversations at scale.</p>
          <div className="auth-orbit">
            <span className="orbit-dot dot-a">✳</span>
            <span className="orbit-dot dot-b">↗</span>
            <span className="orbit-dot dot-c">✦</span>
            <div className="orbit-center">s.</div>
          </div>
        </div>
        <small className="auth-footnote">
          Thoughtful outreach starts here.
        </small>
      </div>
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-eyebrow">
            {mode === "signup" ? "YOUR WORKSPACE" : "WELCOME BACK"}
          </div>
          <h2>
            {mode === "signup"
              ? "Create your account"
              : "Sign in to SequenceOS"}
          </h2>
          <p>
            {mode === "signup"
              ? "Start building a more human pipeline."
              : "Pick up where your team left off."}
          </p>
          {mode === "signup" && (
            <>
              <label>
                Your name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={80}
                />
              </label>
              <label>
                Workspace name
                <input
                  required
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  maxLength={100}
                />
              </label>
            </>
          )}
          <label>
            Work email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              minLength={mode === "signup" ? 12 : 1}
              maxLength={128}
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary-button auth-submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create workspace  →"
                : "Sign in  →"}
          </button>
          <div className="auth-switch">
            {mode === "signup"
              ? "Already have an account?"
              : "New to SequenceOS?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setError("");
              }}
            >
              {mode === "signup" ? "Sign in" : "Create an account"}
            </button>
          </div>
          <small className="auth-security">
            Passwords are securely hashed. Refresh sessions use a protected,
            HttpOnly cookie.
          </small>
        </form>
      </main>
    </div>
  );
}

function UnsubscribeScreen() {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState("error");
      return;
    }
    request("/public/unsubscribe", undefined, {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => setState("done"))
      .catch(() => setState("error"));
  }, []);
  return (
    <main className="unsubscribe-screen">
      <div className="unsubscribe-card">
        <span className="brand-icon">s.</span>
        <h1>
          {state === "working"
            ? "Updating your preferences…"
            : state === "done"
              ? "You’re unsubscribed"
              : "This link could not be used"}
        </h1>
        <p>
          {state === "done"
            ? "We’ll stop sending sequence emails to this address."
            : state === "error"
              ? "The unsubscribe link may have expired. You can contact the sender to update your preferences."
              : "Please wait a moment."}
        </p>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field-label">
      {label}
      {children}
    </label>
  );
}
function App() {
  return window.location.pathname === "/unsubscribe" ? (
    <UnsubscribeScreen />
  ) : (
    <WorkspaceApp />
  );
}

function WorkspaceApp() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [section, setSection] = useState("Overview");
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [analytics, setAnalytics] = useState<{
    leads: number;
    activeCampaigns: number;
    activeSequences: number;
    activeEnrollments: number;
    sentThisMonth: number;
    sendsByStatus: Record<string, number>;
  } | null>(null);
  const [integrations, setIntegrations] = useState<
    {
      id: string;
      provider: string;
      enabled: boolean;
      config: Record<string, string>;
    }[]
  >([]);
  const [leadForm, setLeadForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    title: "",
  });
  const [campaignName, setCampaignName] = useState("");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    subject: "",
    bodyText: "",
  });
  const [sequenceForm, setSequenceForm] = useState({
    name: "",
    campaignId: "",
  });

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId),
    [workspaces, workspaceId],
  );
  const root = `/workspaces/${encodeURIComponent(workspaceId)}`;
  const onSignedIn = (
    accessToken: string,
    currentUser: User,
    currentWorkspaces: Workspace[],
  ) => {
    liveAccessToken = accessToken;
    setToken(accessToken);
    setUser(currentUser);
    setWorkspaces(currentWorkspaces);
    setWorkspaceId(currentWorkspaces[0]?.id ?? "");
  };
  useEffect(() => {
    let active = true;
    request<{ accessToken: string; user: User; workspaces: Workspace[] }>(
      "/auth/refresh",
      undefined,
      { method: "POST" },
    )
      .then((session) => {
        if (active) {
          liveAccessToken = session.accessToken;
          setToken(session.accessToken);
          setUser(session.user);
          setWorkspaces(session.workspaces);
          setWorkspaceId(session.workspaces[0]?.id ?? "");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!token || !workspaceId) return;
    let active = true;
    Promise.all([
      request<{ data: Lead[] }>(`${root}/leads?limit=50`, token),
      request<{ data: Campaign[] }>(`${root}/campaigns`, token),
      request<{ data: Template[] }>(`${root}/templates`, token),
      request<{ data: Sequence[] }>(`${root}/sequences`, token),
      request<{ data: typeof analytics }>(`${root}/analytics`, token),
      request<{ data: typeof integrations }>(`${root}/integrations`, token),
    ])
      .then(
        ([
          leadResult,
          campaignResult,
          templateResult,
          sequenceResult,
          analyticsResult,
          integrationResult,
        ]) => {
          if (!active) return;
          setLeads(leadResult.data);
          setCampaigns(campaignResult.data);
          setTemplates(templateResult.data);
          setSequences(sequenceResult.data);
          setAnalytics(analyticsResult.data);
          setIntegrations(integrationResult.data);
          setError("");
        },
      )
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load workspace data",
          );
      });
    return () => {
      active = false;
    };
  }, [root, token, workspaceId]);
  const refreshWorkspace = async () => {
    if (!workspaceId) return;
    const [
      leadResult,
      campaignResult,
      templateResult,
      sequenceResult,
      analyticsResult,
      integrationResult,
    ] = await Promise.all([
      request<{ data: Lead[] }>(`${root}/leads?limit=50`, token),
      request<{ data: Campaign[] }>(`${root}/campaigns`, token),
      request<{ data: Template[] }>(`${root}/templates`, token),
      request<{ data: Sequence[] }>(`${root}/sequences`, token),
      request<{ data: typeof analytics }>(`${root}/analytics`, token),
      request<{ data: typeof integrations }>(`${root}/integrations`, token),
    ]);
    setLeads(leadResult.data);
    setCampaigns(campaignResult.data);
    setTemplates(templateResult.data);
    setSequences(sequenceResult.data);
    setAnalytics(analyticsResult.data);
    setIntegrations(integrationResult.data);
  };
  const signOut = async () => {
    await request("/auth/logout", token, { method: "POST" }).catch(() => {});
    liveAccessToken = "";
    setToken("");
    setUser(null);
    setWorkspaces([]);
    setWorkspaceId("");
  };
  const nav = [
    "Overview",
    "Campaigns",
    "Sequences",
    "Leads",
    "Templates",
    "Analytics",
    "Settings",
  ];
  if (booting)
    return (
      <div className="loading-screen">
        <span className="brand-icon">s.</span>
        <p>Opening your workspace…</p>
      </div>
    );
  if (!token || !user) return <AuthScreen onSignedIn={onSignedIn} />;
  const submitLead = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await request(`${root}/leads`, token, {
        method: "POST",
        body: JSON.stringify(leadForm),
      });
      setLeadForm({
        firstName: "",
        lastName: "",
        email: "",
        company: "",
        title: "",
      });
      await refreshWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add lead");
    }
  };
  const submitCampaign = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await request(`${root}/campaigns`, token, {
        method: "POST",
        body: JSON.stringify({ name: campaignName }),
      });
      setCampaignName("");
      await refreshWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create campaign",
      );
    }
  };
  const submitTemplate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await request(`${root}/templates`, token, {
        method: "POST",
        body: JSON.stringify(templateForm),
      });
      setTemplateForm({ name: "", subject: "", bodyText: "" });
      await refreshWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save template",
      );
    }
  };
  const submitSequence = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await request(`${root}/sequences`, token, {
        method: "POST",
        body: JSON.stringify(sequenceForm),
      });
      setSequenceForm({ name: "", campaignId: "" });
      await refreshWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create sequence",
      );
    }
  };
  const addSequenceStep = async (
    sequence: Sequence,
    templateId: string,
    delayMinutes: number,
  ) => {
    try {
      await request(`${root}/sequences/${sequence.id}/steps`, token, {
        method: "POST",
        body: JSON.stringify({
          position: sequence.steps.length,
          templateId,
          delayMinutes,
        }),
      });
      await refreshWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add step");
    }
  };
  const enrollLeads = async (sequence: Sequence) => {
    try {
      const result = await request<{
        scheduled: number;
        skippedSuppressed: number;
      }>(`${root}/sequences/${sequence.id}/enrollments`, token, {
        method: "POST",
        body: JSON.stringify({ leadIds: leads.map((lead) => lead.id) }),
      });
      setError(
        `Queued ${result.scheduled} leads; skipped ${result.skippedSuppressed} suppressed.`,
      );
      await refreshWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not enroll leads",
      );
    }
  };
  const updateCampaignStatus = async (campaign: Campaign) => {
    const status = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await request(`${root}/campaigns/${campaign.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refreshWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update campaign",
      );
    }
  };
  const updateIntegration = async (provider: string, enabled: boolean) => {
    try {
      await request(`${root}/integrations/${provider}`, token, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      await refreshWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update integration",
      );
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-icon">s.</span>
          <span>
            sequence<span className="brand-os">OS</span>
          </span>
        </a>
        <label className="workspace-switch">
          <span className="workspace-mark">
            {workspace?.name.slice(0, 1) ?? "S"}
          </span>
          <select
            aria-label="Workspace"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          >
            {workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span className="chevron">⌄</span>
        </label>
        <nav aria-label="Main navigation">
          <p className="nav-label">WORKSPACE</p>
          {nav.map((item, index) => (
            <button
              key={item}
              className={`nav-item ${section === item ? "selected" : ""}`}
              onClick={() => setSection(item)}
            >
              <span>{["▦", "✳", "⌁", "♙", "▤", "↗", "⚙"][index]}</span>
              {item}
              {item === "Campaigns" &&
                campaigns.filter((campaign) => campaign.status === "ACTIVE")
                  .length > 0 && (
                  <i>
                    {
                      campaigns.filter(
                        (campaign) => campaign.status === "ACTIVE",
                      ).length
                    }
                  </i>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="profile-avatar">
              {user.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div>
              <b>{user.name}</b>
              <small>{user.email}</small>
            </div>
            <button
              className="dots"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
            >
              ↪
            </button>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="crumb">
            <span>{workspace?.name ?? "Workspace"}</span>
            <b>/</b>
            <strong>{section}</strong>
          </div>
          <div className="top-actions">
            <span className="connection">
              <i></i> Live workspace
            </span>
            <div className="top-avatar">
              {user.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
          </div>
        </header>
        <div className="page-wrap">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                WORKSPACE OVERVIEW <span className="sun">✳</span>
              </div>
              <h1>
                {section === "Overview"
                  ? `Good to see you, ${user.name.split(" ")[0]}`
                  : section}
              </h1>
              <p>
                {section === "Overview"
                  ? "Here’s what’s happening with your outreach today."
                  : `Manage your ${section.toLowerCase()} in ${workspace?.name ?? "this workspace"}.`}
              </p>
            </div>
            {section === "Overview" && (
              <button
                className="primary-button"
                onClick={() => setSection("Campaigns")}
              >
                <span>＋</span> New campaign
              </button>
            )}
          </section>
          {error && (
            <div className="alert-error" role="alert">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {section === "Overview" && (
            <>
              <section className="stat-grid" aria-label="Workspace statistics">
                {[
                  {
                    label: "Active sequences",
                    value: analytics?.activeSequences ?? "—",
                    note: `${analytics?.activeCampaigns ?? 0} active campaigns`,
                    tone: "mint",
                  },
                  {
                    label: "Emails sent",
                    value: analytics?.sentThisMonth ?? "—",
                    note: "This month",
                    tone: "blue",
                  },
                  {
                    label: "Leads",
                    value: analytics?.leads ?? "—",
                    note: "In this workspace",
                    tone: "peach",
                  },
                  {
                    label: "Active enrollments",
                    value: analytics?.activeEnrollments ?? "—",
                    note: "Currently running",
                    tone: "lilac",
                  },
                ].map((stat) => (
                  <article className="stat-card" key={stat.label}>
                    <div className="stat-top">
                      <span>{stat.label}</span>
                      <span className={`stat-icon ${stat.tone}`}>↗</span>
                    </div>
                    <strong className="stat-value">{stat.value}</strong>
                    <small>{stat.note}</small>
                  </article>
                ))}
              </section>
              <section className="panel campaigns-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Campaigns</h2>
                    <p>Your current outreach programs</p>
                  </div>
                  <button
                    className="view-link button-link"
                    onClick={() => setSection("Campaigns")}
                  >
                    Manage campaigns →
                  </button>
                </div>
                <CampaignTable
                  campaigns={campaigns.slice(0, 5)}
                  onToggle={updateCampaignStatus}
                />
              </section>
              <section className="content-grid lower-grid">
                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Sequence activity</h2>
                      <p>Messages sent by status this month</p>
                    </div>
                  </div>
                  <div className="activity-summary">
                    {Object.entries(analytics?.sendsByStatus ?? {}).length ? (
                      Object.entries(analytics!.sendsByStatus).map(
                        ([status, count]) => (
                          <div className="summary-row" key={status}>
                            <span>{status.toLowerCase()}</span>
                            <b>{count}</b>
                          </div>
                        ),
                      )
                    ) : (
                      <EmptyState text="No email activity yet. Enroll leads in a sequence to begin." />
                    )}
                  </div>
                </article>
                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Getting started</h2>
                      <p>Build your first thoughtful sequence</p>
                    </div>
                  </div>
                  <div className="getting-started">
                    <span>01</span>
                    <div>
                      <b>Add a few leads</b>
                      <small>Keep your contacts organized in one place.</small>
                    </div>
                    <button onClick={() => setSection("Leads")}>→</button>
                  </div>
                  <div className="getting-started">
                    <span>02</span>
                    <div>
                      <b>Write a template</b>
                      <small>Start with a message that sounds like you.</small>
                    </div>
                    <button onClick={() => setSection("Templates")}>→</button>
                  </div>
                  <div className="getting-started">
                    <span>03</span>
                    <div>
                      <b>Connect the pieces</b>
                      <small>Turn messages into a sequence.</small>
                    </div>
                    <button onClick={() => setSection("Sequences")}>→</button>
                  </div>
                </article>
              </section>
            </>
          )}
          {section === "Leads" && (
            <>
              <section className="panel form-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Add a lead</h2>
                    <p>Contact information stays within this workspace.</p>
                  </div>
                </div>
                <form className="inline-form lead-form" onSubmit={submitLead}>
                  <Field label="First name">
                    <input
                      value={leadForm.firstName}
                      onChange={(e) =>
                        setLeadForm({ ...leadForm, firstName: e.target.value })
                      }
                      maxLength={80}
                    />
                  </Field>
                  <Field label="Last name">
                    <input
                      value={leadForm.lastName}
                      onChange={(e) =>
                        setLeadForm({ ...leadForm, lastName: e.target.value })
                      }
                      maxLength={80}
                    />
                  </Field>
                  <Field label="Work email">
                    <input
                      required
                      type="email"
                      value={leadForm.email}
                      onChange={(e) =>
                        setLeadForm({ ...leadForm, email: e.target.value })
                      }
                      maxLength={254}
                    />
                  </Field>
                  <Field label="Company">
                    <input
                      value={leadForm.company}
                      onChange={(e) =>
                        setLeadForm({ ...leadForm, company: e.target.value })
                      }
                      maxLength={160}
                    />
                  </Field>
                  <button className="primary-button">＋ Add lead</button>
                </form>
              </section>
              <DataPanel
                title="Leads"
                subtitle={`${leads.length} contacts shown`}
              >
                <div className="data-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>NAME</th>
                        <th>EMAIL</th>
                        <th>COMPANY</th>
                        <th>TITLE</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => (
                        <tr key={lead.id}>
                          <td>
                            <b>
                              {[lead.firstName, lead.lastName]
                                .filter(Boolean)
                                .join(" ") || "—"}
                            </b>
                          </td>
                          <td>{lead.email}</td>
                          <td>{lead.company ?? "—"}</td>
                          <td>{lead.title ?? "—"}</td>
                          <td>
                            <button
                              className="row-more"
                              onClick={async () => {
                                if (
                                  confirm(
                                    `Remove ${lead.email} from this workspace?`,
                                  )
                                ) {
                                  await request(
                                    `${root}/leads/${lead.id}`,
                                    token,
                                    { method: "DELETE" },
                                  );
                                  await refreshWorkspace();
                                }
                              }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!leads.length && (
                    <EmptyState text="No leads yet. Add your first contact above." />
                  )}
                </div>
              </DataPanel>
            </>
          )}
          {section === "Campaigns" && (
            <>
              <section className="panel form-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Create a campaign</h2>
                    <p>Campaigns group your sequences and reporting.</p>
                  </div>
                </div>
                <form className="inline-form" onSubmit={submitCampaign}>
                  <Field label="Campaign name">
                    <input
                      required
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      maxLength={120}
                      placeholder="e.g. Product launch"
                    />
                  </Field>
                  <button className="primary-button">＋ Create campaign</button>
                </form>
              </section>
              <DataPanel
                title="All campaigns"
                subtitle={`${campaigns.length} campaigns`}
              >
                <CampaignTable
                  campaigns={campaigns}
                  onToggle={updateCampaignStatus}
                />
              </DataPanel>
            </>
          )}
          {section === "Templates" && (
            <>
              <section className="panel form-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Write an email template</h2>
                    <p>
                      Use {"{{firstName}}"} and {"{{company}}"} to personalize
                      each message. AI drafts are generated only on request and
                      should be reviewed before use.
                    </p>
                  </div>
                </div>
                <form className="template-form" onSubmit={submitTemplate}>
                  <Field label="Template name">
                    <input
                      required
                      value={templateForm.name}
                      onChange={(e) =>
                        setTemplateForm({
                          ...templateForm,
                          name: e.target.value,
                        })
                      }
                      maxLength={100}
                    />
                  </Field>
                  <Field label="Subject">
                    <input
                      required
                      value={templateForm.subject}
                      onChange={(e) =>
                        setTemplateForm({
                          ...templateForm,
                          subject: e.target.value,
                        })
                      }
                      maxLength={250}
                    />
                  </Field>
                  <Field label="Message">
                    <textarea
                      required
                      rows={7}
                      value={templateForm.bodyText}
                      onChange={(e) =>
                        setTemplateForm({
                          ...templateForm,
                          bodyText: e.target.value,
                        })
                      }
                      maxLength={100000}
                    />
                  </Field>
                  <button className="primary-button">Save template</button>
                </form>
              </section>
              <div className="template-grid">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    leads={leads}
                    token={token}
                    workspaceId={workspaceId}
                  />
                ))}
                {!templates.length && (
                  <div className="panel empty-card">
                    <EmptyState text="Your saved templates will appear here." />
                  </div>
                )}
              </div>
            </>
          )}
          {section === "Sequences" && (
            <>
              <section className="panel form-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Start a sequence</h2>
                    <p>
                      Create a sequence inside a campaign, then add message
                      steps.
                    </p>
                  </div>
                </div>
                <form className="inline-form" onSubmit={submitSequence}>
                  <Field label="Sequence name">
                    <input
                      required
                      value={sequenceForm.name}
                      onChange={(e) =>
                        setSequenceForm({
                          ...sequenceForm,
                          name: e.target.value,
                        })
                      }
                      maxLength={120}
                    />
                  </Field>
                  <Field label="Campaign">
                    <select
                      required
                      value={sequenceForm.campaignId}
                      onChange={(e) =>
                        setSequenceForm({
                          ...sequenceForm,
                          campaignId: e.target.value,
                        })
                      }
                    >
                      <option value="">Select a campaign</option>
                      {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    className="primary-button"
                    disabled={!campaigns.length}
                  >
                    ＋ Create sequence
                  </button>
                </form>
              </section>
              <div className="sequence-grid">
                {sequences.map((sequence) => (
                  <SequenceCard
                    key={sequence.id}
                    sequence={sequence}
                    templates={templates}
                    leadCount={leads.length}
                    onAddStep={addSequenceStep}
                    onEnroll={enrollLeads}
                  />
                ))}
                {!sequences.length && (
                  <div className="panel empty-card">
                    <EmptyState text="Create a campaign first, then add your first sequence." />
                  </div>
                )}
              </div>
            </>
          )}
          {section === "Analytics" && (
            <section className="stat-grid analytics-grid">
              {[
                {
                  label: "Total leads",
                  value: analytics?.leads ?? "—",
                  note: "All workspace contacts",
                  tone: "peach",
                },
                {
                  label: "Active campaigns",
                  value: analytics?.activeCampaigns ?? "—",
                  note: "Currently running",
                  tone: "mint",
                },
                {
                  label: "Active sequences",
                  value: analytics?.activeSequences ?? "—",
                  note: "In active campaigns",
                  tone: "lilac",
                },
                {
                  label: "Emails this month",
                  value: analytics?.sentThisMonth ?? "—",
                  note: "Sent or delivered",
                  tone: "blue",
                },
              ].map((stat) => (
                <article className="stat-card" key={stat.label}>
                  <div className="stat-top">
                    <span>{stat.label}</span>
                    <span className={`stat-icon ${stat.tone}`}>↗</span>
                  </div>
                  <strong className="stat-value">{stat.value}</strong>
                  <small>{stat.note}</small>
                </article>
              ))}
            </section>
          )}
          {section === "Settings" && (
            <>
              <DataPanel
                title="Connected services"
                subtitle="Workspace integration settings"
              >
                <div className="integration-list">
                  {[
                    "INFRAOS",
                    "SCOUTOS",
                    "TRIAGEOS",
                    "SALESFORCE",
                    "HUBSPOT",
                  ].map((provider) => {
                    const integration = integrations.find(
                      (item) => item.provider === provider,
                    );
                    const supported = provider === "INFRAOS";
                    return (
                      <div className="integration-item" key={provider}>
                        <div className="integration-icon">
                          {provider.slice(0, 1)}
                        </div>
                        <div className="integration-copy">
                          <b>{provider}</b>
                          <small>
                            {provider === "INFRAOS"
                              ? "Outbound email delivery"
                              : provider === "SCOUTOS"
                                ? "Lead sourcing · contract needed"
                                : provider === "TRIAGEOS"
                                  ? "Reply and event webhooks · contract needed"
                                  : "CRM sync · contract needed"}
                          </small>
                        </div>
                        <span className="integration-state">
                          {integration?.enabled
                            ? "Enabled"
                            : supported
                              ? "Not connected"
                              : "Unavailable"}
                        </span>
                        <button
                          className={`toggle ${integration?.enabled ? "on" : ""}`}
                          aria-label={`${integration?.enabled ? "Disable" : "Enable"} ${provider}`}
                          disabled={!supported}
                          onClick={() =>
                            updateIntegration(provider, !integration?.enabled)
                          }
                        >
                          <i></i>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="settings-note">
                  Configure InfraOS URL, API key, and sender details in the
                  server environment. Other adapters need their provider API
                  contracts before they can be enabled.
                </p>
              </DataPanel>
              <DataPanel
                title="Workspace details"
                subtitle="Your current workspace"
              >
                <div className="workspace-details">
                  <div>
                    <small>Name</small>
                    <b>{workspace?.name}</b>
                  </div>
                  <div>
                    <small>Your role</small>
                    <b>{workspace?.role}</b>
                  </div>
                  <div>
                    <small>Members</small>
                    <b>Member management is coming next</b>
                  </div>
                </div>
              </DataPanel>
            </>
          )}
          <footer>
            <span>
              SequenceOS <b>·</b> Thoughtful outreach, organized
            </span>
            <span>
              <a href="https://github.com/">API documentation</a>
              <a href="#status">
                <i className="online-dot"></i> API-connected workspace
              </a>
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function CampaignTable({
  campaigns,
  onToggle,
}: {
  campaigns: Campaign[];
  onToggle: (campaign: Campaign) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>CAMPAIGN</th>
            <th>STATUS</th>
            <th>SEQUENCES</th>
            <th>CREATED</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td>
                <span className="campaign-symbol purple">✳</span>
                <span className="campaign-name">{campaign.name}</span>
              </td>
              <td>
                <span
                  className={`status-pill ${campaign.status === "ACTIVE" ? "live" : campaign.status === "PAUSED" ? "paused" : "draft"}`}
                >
                  <i></i>
                  {campaign.status.toLowerCase()}
                </span>
              </td>
              <td>{campaign._count?.sequences ?? 0}</td>
              <td>—</td>
              <td>
                <button
                  className="row-action"
                  onClick={() => onToggle(campaign)}
                  disabled={campaign.status === "ARCHIVED"}
                >
                  {campaign.status === "ACTIVE" ? "Pause" : "Activate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!campaigns.length && (
        <EmptyState text="No campaigns yet. Create one to start organizing outreach." />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  leads,
  token,
  workspaceId,
}: {
  template: Template;
  leads: Lead[];
  token: string;
  workspaceId: string;
}) {
  const [leadId, setLeadId] = useState("");
  const [preview, setPreview] = useState<{
    subject: string;
    body: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    if (!leadId) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const result = await request<{
        data: { subject: string; body: string };
      }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/personalizations`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ leadId, templateId: template.id }),
        },
      );
      setPreview(result.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not generate draft",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="panel template-card">
      <div className="template-card-icon">▤</div>
      <div className="template-title">
        <b>{template.name}</b>
        <small>{template.subject}</small>
      </div>
      <p>
        {template.bodyText.slice(0, 180)}
        {template.bodyText.length > 180 ? "…" : ""}
      </p>
      <div className="ai-generate">
        <select
          aria-label={`Lead for ${template.name} AI draft`}
          value={leadId}
          onChange={(event) => setLeadId(event.target.value)}
        >
          <option value="">Choose lead</option>
          {leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {[lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
                lead.email}
            </option>
          ))}
        </select>
        <button
          className="row-action"
          disabled={!leadId || busy}
          onClick={() => void generate()}
        >
          {busy ? "Drafting…" : "AI draft"}
        </button>
      </div>
      <small className="ai-disclosure">
        Generates on request. Contact name, company, title, and this template
        are sent to the server configured AI provider. Email address is
        excluded.
      </small>
      {error && <div className="ai-error">{error}</div>}
      {preview && (
        <div className="ai-preview">
          <b>{preview.subject}</b>
          <pre>{preview.body}</pre>
        </div>
      )}
    </article>
  );
}

function SequenceCard({
  sequence,
  templates,
  leadCount,
  onAddStep,
  onEnroll,
}: {
  sequence: Sequence;
  templates: Template[];
  leadCount: number;
  onAddStep: (
    sequence: Sequence,
    templateId: string,
    delayMinutes: number,
  ) => Promise<void>;
  onEnroll: (sequence: Sequence) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState("");
  const [delayMinutes, setDelayMinutes] = useState(0);
  return (
    <article className="panel sequence-card">
      <div className="sequence-top">
        <span className="sequence-glyph">⌁</span>
        <span
          className={`status-pill ${sequence.campaign.status === "ACTIVE" ? "live" : "paused"}`}
        >
          <i></i>
          {sequence.campaign.status.toLowerCase()}
        </span>
      </div>
      <h3>{sequence.name}</h3>
      <p>Campaign · {sequence.campaign.name}</p>
      <div className="sequence-bottom">
        <span>{sequence.steps.length} steps</span>
        <span>{sequence._count?.enrollments ?? 0} enrolled</span>
      </div>
      <ol className="step-list">
        {sequence.steps.map((step) => (
          <li key={step.id}>
            <span>{step.position + 1}</span>
            <div>
              <b>{step.template.name}</b>
              <small>
                {step.template.subject} · {step.delayMinutes} min delay
              </small>
            </div>
          </li>
        ))}
      </ol>
      {templates.length > 0 && (
        <form
          className="step-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (templateId)
              void onAddStep(sequence, templateId, Number(delayMinutes));
          }}
        >
          <select
            aria-label="Email template"
            required
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Choose a template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Delay in minutes"
            type="number"
            min="0"
            max="525600"
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(Number(e.target.value))}
          />
          <button className="row-action" disabled={!templateId}>
            Add step
          </button>
        </form>
      )}
      {sequence.campaign.status === "ACTIVE" && sequence.steps.length > 0 && (
        <button
          className="primary-button enroll-button"
          disabled={!leadCount}
          onClick={() => void onEnroll(sequence)}
        >
          Enroll {leadCount} leads
        </button>
      )}
    </article>
  );
}
function DataPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="panel data-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <span>✳</span>
      <p>{text}</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
