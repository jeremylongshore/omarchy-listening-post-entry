import { useEffect, useMemo, useState } from "react";
import type { PerceptionSignal, PerceptionSnapshot } from "@listening-post/perception-contract";
import { ApiError, consumeMagicLink, createDevice, isDemoMode, loadAccount, loadDevices, loadSnapshot, logout, magicTokenFromHash, markSignalRead, requestMagicLink, revokeDevice, saveTopics, type Account, type Device } from "./api";
import { PublicExperience } from "./PublicExperience";
import { activationState, closeOnboarding, onboardingWasClosed } from "./onboarding";
import { trackProductEvent } from "./product-events";

type View = "signals" | "brief" | "topics" | "connect" | "account";
const views = [
  { id: "signals", label: "Signals" }, { id: "brief", label: "Daily brief" },
  { id: "topics", label: "Topics" }, { id: "connect", label: "Omarchy" },
  { id: "account", label: "Account" },
] as const;

function relativeTime(value: string | null) {
  if (!value) return "Publication time unknown";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function SignalRow({ signal, onOpen }: { signal: PerceptionSignal; onOpen?:() => void }) {
  return (
    <article id={`signal-${signal.id}`} className={`signal-row lane-${signal.lane}${signal.lane === "incident" && signal.resolved ? " is-resolved" : ""}`}>
      <div className="signal-score" aria-label={`${signal.relevance} percent relevance`}><strong>{signal.relevance}</strong><span>match</span></div>
      <div className="signal-copy">
        <div className="signal-meta"><span>{signal.lane === "incident" && signal.resolved ? "resolved incident" : signal.quiet ? "changelog" : signal.lane}</span><span>{signal.source}</span><time>{relativeTime(signal.publishedAt)}</time></div>
        <a href={signal.url} target="_blank" rel="noreferrer" onClick={onOpen}>{signal.title}</a>
      </div>
      <span className={signal.read ? "read-mark is-read" : "read-mark"} aria-hidden="true" /><span className="sr-only">{signal.read ? "Read" : "Unread"}</span>
    </article>
  );
}

export function App() {
  const query = new URLSearchParams(window.location.search);
  const opensSignalRoom = query.has("room") || Boolean(magicTokenFromHash(window.location.hash));
  if (!opensSignalRoom) return <PublicExperience page={query.get("page")} />;
  return <SignalRoom />;
}

function SignalRoom() {
  const [view, setView] = useState<View>("signals");
  const [snapshot, setSnapshot] = useState<PerceptionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [entitlementRequired, setEntitlementRequired] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState("");
  const [authSent, setAuthSent] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(import.meta.env.VITE_LEMONSQUEEZY_CHECKOUT_URL || null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [newDeviceToken, setNewDeviceToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [topicEditorOpen, setTopicEditorOpen] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [topicKeywords, setTopicKeywords] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const demo = isDemoMode();
  const [onboardingOpen, setOnboardingOpen] = useState(() => !demo && !onboardingWasClosed(window.localStorage));

  useEffect(() => {
    const controller = new AbortController();
    const hasMagicFragment = window.location.hash.startsWith("#") && new URLSearchParams(window.location.hash.slice(1)).has("magic");
    const magicToken = magicTokenFromHash(window.location.hash);
    if (hasMagicFragment) window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
    async function start() {
      if (magicToken && !demo) {
        try { await consumeMagicLink(magicToken); }
        catch { if (!controller.signal.aborted) setNotice("That sign-in link is invalid or has expired. Request a fresh one."); }
      }
      else if (hasMagicFragment && !controller.signal.aborted) setNotice("That sign-in link is invalid or has expired. Request a fresh one.");
      try { setSnapshot(await loadSnapshot(controller.signal)); }
      catch (reason: unknown) {
        if (!controller.signal.aborted) {
          if (reason instanceof ApiError && reason.status === 401) setAuthRequired(true);
          else if (reason instanceof ApiError && reason.status === 402) {
            setEntitlementRequired(true); setCheckoutUrl(reason.checkoutUrl ?? null);
            void loadAccount().then(setAccount).catch(() => undefined);
          }
          else setError(reason instanceof Error ? reason.message : "Perception could not load.");
        }
      }
    }
    void start();
    return () => controller.abort();
  }, [demo]);

  useEffect(() => {
    if (!snapshot || demo) return;
    Promise.all([loadDevices(), loadAccount()]).then(([nextDevices, nextAccount]) => { setDevices(nextDevices); setAccount(nextAccount); }).catch(() => setDevices([]));
  }, [snapshot, demo]);

  useEffect(() => {
    if (!snapshot || demo) return;
    trackProductEvent("signal_room_opened", true);
  }, [snapshot, demo]);

  useEffect(() => {
    if (demo || !devices.some((device) => device.lastSeenAt)) return;
    trackProductEvent("listening_post_paired", true);
  }, [devices, demo]);

  useEffect(() => {
    if (!snapshot) return;
    const signalId = new URLSearchParams(window.location.search).get("signal");
    if (!signalId || !/^[A-Za-z0-9_-]{1,160}$/.test(signalId)) return;
    setView("signals");
    window.requestAnimationFrame(() => {
      const row = document.getElementById(`signal-${signalId}`);
      if (!row) return;
      row.classList.add("is-deep-linked");
      row.scrollIntoView({ block:"center", behavior:"smooth" });
    });
  }, [snapshot]);

  async function sendMagicLink(event:React.FormEvent) {
    event.preventDefault(); setAuthSubmitting(true); setNotice(null);
    try {
      const result = await requestMagicLink(email);
      setCheckoutUrl(result.checkoutUrl); setAuthSent(true); trackProductEvent("magic_link_requested");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Sign-in email could not be requested."); }
    finally { setAuthSubmitting(false); }
  }

  async function pairDevice() {
    setNotice(null);
    try {
      const created = await createDevice("Omarchy workstation");
      setDevices((current) => [created.device, ...current]);
      setNewDeviceToken(created.token); setTokenCopied(false);
      trackProductEvent("device_credential_created");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Device pairing failed."); }
  }

  async function copyToken() {
    if (!newDeviceToken) return;
    try { await navigator.clipboard.writeText(newDeviceToken); setTokenCopied(true); }
    catch { setNotice("Your browser could not copy the token. Select it manually, then paste it into the hidden connector prompt."); }
  }

  function closeGuide() {
    closeOnboarding(window.localStorage); setOnboardingOpen(false);
  }

  async function signOut() {
    try { await logout(); window.location.assign("/"); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Perception could not sign out."); }
  }

  async function removeDevice(deviceId:string) {
    try {
      await revokeDevice(deviceId);
      setDevices((current) => current.filter((device) => device.id !== deviceId));
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Device revocation failed."); }
  }

  async function toggleTopic(topicId:string) {
    if (!snapshot || demo) return;
    const topics = snapshot.topics.map((topic) => topic.id === topicId ? { ...topic, enabled:!topic.enabled } : topic);
    try {
      const saved = await saveTopics(topics);
      setSnapshot({ ...snapshot, topics:saved });
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Topic update failed."); }
  }

  async function removeTopic(topicId:string) {
    if (!snapshot || demo) return;
    try {
      const saved = await saveTopics(snapshot.topics.filter((topic) => topic.id !== topicId));
      setSnapshot({ ...snapshot, topics:saved });
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Topic removal failed."); }
  }

  async function addTopic(event:React.FormEvent) {
    event.preventDefault();
    if (!snapshot || demo) return;
    const keywords = topicKeywords.split(",").map((keyword) => keyword.trim()).filter(Boolean);
    if (!topicName.trim() || keywords.length > 8) { setNotice("Give the topic a name and no more than eight comma-separated keywords."); return; }
    try {
      const saved = await saveTopics([...snapshot.topics, { id:`topic_${crypto.randomUUID()}`, name:topicName.trim(), keywords, enabled:true }]);
      setSnapshot({ ...snapshot, topics:saved }); setTopicName(""); setTopicKeywords(""); setTopicEditorOpen(false);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Topic creation failed."); }
  }

  function readSignal(signalId:string) {
    if (!snapshot || demo) return;
    setSnapshot({ ...snapshot, signals:snapshot.signals.map((signal) => signal.id === signalId ? { ...signal, read:true } : signal) });
    void markSignalRead(signalId).catch((reason) => setNotice(reason instanceof Error ? reason.message : "Read state did not sync."));
    trackProductEvent("first_signal_opened", true);
  }

  const briefSignals = useMemo(() => {
    if (!snapshot) return [];
    const byId = new Map(snapshot.signals.map((signal) => [signal.id, signal]));
    return snapshot.brief.highlights.flatMap((highlight) => {
      const signal = byId.get(highlight.signalId);
      return signal ? [{ signal, reason: highlight.reason }] : [];
    });
  }, [snapshot]);
  const isStale = snapshot ? Date.now() > Date.parse(snapshot.staleAfter) : false;
  const activation = snapshot ? activationState(snapshot, devices) : null;

  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="wordmark" href="#top" aria-label="Perception home"><span>PER</span>CEPTION</a>
        <div className="masthead-status"><span className={isStale ? "idle-dot" : "pulse"} /> {demo ? "Demo field" : isStale ? "Last good field" : "Priority field"} <b>{snapshot?.signals.length ?? "—"}</b></div>
        <span className="avatar" aria-label={demo ? "Demo account" : "Signed-in account"}>{snapshot?.account.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? account?.displayName.slice(0, 2).toUpperCase() ?? "P"}</span>
      </header>
      <aside className="rail" aria-label="Primary navigation">
        <p>Signal room</p>
        {views.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><span>{item.label.slice(0, 2).toUpperCase()}</span>{item.label}</button>)}
        <div className="rail-foot"><small>Contract v1</small><b>{demo ? "Demo snapshot" : account?.entitlement?.status ?? "Account sync"}</b></div>
      </aside>
      <main id="top" className="workspace">
        <div className="signal-ribbon" aria-label="Current field status"><span>FIELD / {snapshot ? "LIVE" : "OPENING"}</span><div className="ribbon-track"><i /><i /><i /><i /><i /><i /><i /><i /></div><span>{snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span></div>
        {authRequired || entitlementRequired ? <section className="state-panel auth-panel">
          <p>{entitlementRequired ? "Access needs attention" : "Your private field"}</p>
          <h1>{authSent ? "Check your inbox." : entitlementRequired ? "Return to the signal." : "Bring your watchlist into focus."}</h1>
          {authSent ? <span>If that email belongs to a Perception customer, a private link is on its way. It expires in 15 minutes and works once.</span> : <>
            <span>{entitlementRequired ? "Use the email from your Perception purchase to sign in, or manage your subscription below." : "Enter the email used for your Perception purchase. No password required."}</span>
            <form className="auth-form" onSubmit={(event) => void sendMagicLink(event)}>
              <label htmlFor="account-email">Purchase email</label>
              <div><input id="account-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button type="submit" disabled={authSubmitting}>{authSubmitting ? "Sending…" : "Email me a sign-in link"}</button></div>
            </form>
          </>}
          <div className="access-links">
            {account?.entitlement?.customerPortalUrl ? <a href={account.entitlement.customerPortalUrl}>Manage subscription</a> : null}
            {checkoutUrl ? <a href={checkoutUrl}>Buy Perception</a> : null}
            {authSent ? <button onClick={() => setAuthSent(false)}>Use a different email</button> : null}
          </div>
        </section> : null}
        {error ? <section className="state-panel"><p>Connection interrupted</p><h1>The signal room could not open.</h1><span>{error}</span><button onClick={() => window.location.reload()}>Try again</button></section> : null}
        {notice ? <div className="inline-notice" role="alert">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss message"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg></button></div> : null}
        {!authRequired && !entitlementRequired && !error && !snapshot ? <section className="state-panel"><p>Tuning sources</p><h1>Opening the signal room…</h1></section> : null}
        {snapshot && onboardingOpen ? <section className="activation-guide" aria-labelledby="activation-title">
          <div className="activation-copy"><h2 id="activation-title">{activation?.coreComplete ? "You found the signal." : "Make Perception yours."}</h2><p>{activation?.coreComplete ? "Your topics are active and you opened a source-backed signal. Pair Listening Post now, or keep it for later." : "About two minutes: confirm what is worth watching, then open one real source. That is the whole core loop."}</p></div>
          <div className="activation-steps">
            <button className={activation?.topicReady ? "is-complete" : ""} onClick={() => setView("topics")}><b>{activation?.topicReady ? "Ready" : "Step one"}</b><span>Confirm your topics</span></button>
            <button className={activation?.firstSignalRead ? "is-complete" : ""} onClick={() => setView("signals")}><b>{activation?.firstSignalRead ? "Opened" : "Step two"}</b><span>Open a source-backed signal</span></button>
            <button className={activation?.devicePaired ? "is-complete" : ""} onClick={() => setView("connect")}><b>{activation?.devicePaired ? "Paired" : "Optional"}</b><span>Bring it to Omarchy</span></button>
          </div>
          <button className="guide-dismiss" onClick={closeGuide}>{activation?.coreComplete ? "Finish and close" : "Skip this guide"}</button>
        </section> : null}
        {snapshot && view === "signals" ? <><section className="page-intro"><div><h1>What changed<br />while you worked.</h1></div><div className="intro-note"><b>{snapshot.account.displayName},</b> your watchlist found {snapshot.signals.filter((signal) => !signal.read).length} unread signals across {snapshot.topics.filter((topic) => topic.enabled).length} active topics.</div></section>{isStale ? <div className="stale-note" role="status">Showing the last good field from {relativeTime(snapshot.generatedAt)}. Perception will replace it after a successful refresh.</div> : null}<section className="section-head"><h2>Priority field</h2><span>Ranked by operational impact + your topics</span></section>{snapshot.signals.length ? <div className="signal-list">{snapshot.signals.map((signal) => <SignalRow key={signal.id} signal={signal} onOpen={() => readSignal(signal.id)} />)}</div> : <div className="quiet-state"><b>The field is quiet.</b><span>No current signals crossed your topic threshold.</span></div>}<section className="source-health" aria-label="Source health"><h2>Source health</h2>{snapshot.sourceHealth.map((source) => <div key={source.id}><span className={source.status === "healthy" ? "pulse" : "idle-dot"} /><b>{source.name}</b><small>{source.status} · checked {relativeTime(source.checkedAt)}</small></div>)}</section></> : null}
        {snapshot && view === "brief" ? <section className="brief-view"><header className="view-title"><h1>The brief</h1><p>Last 24 hours · {briefSignals.length} linked highlights</p></header>{briefSignals.map(({ signal, reason }, index) => <article key={signal.id} className="brief-item"><b>{String(index + 1).padStart(2, "0")}</b><div><SignalRow signal={signal} onOpen={() => readSignal(signal.id)} /><p>{reason}</p></div></article>)}</section> : null}
        {snapshot && view === "topics" ? <section className="topics-view"><header className="view-title"><h1>Topics</h1><p>Your attention policy · {snapshot.topics.length} of 8 configured</p></header><div className="topic-grid">{snapshot.topics.map((topic) => <article key={topic.id}><span>{topic.enabled ? "Watching" : "Paused"}</span><h2>{topic.name}</h2><p>{topic.keywords.join(" · ")}</p>{demo ? <small>Editing is unavailable in the demo snapshot.</small> : <div className="topic-actions"><button className="topic-action" onClick={() => void toggleTopic(topic.id)}>{topic.enabled ? "Pause" : "Watch"}</button><button className="topic-action danger-action" onClick={() => void removeTopic(topic.id)}>Remove</button></div>}</article>)}{topicEditorOpen ? <form className="topic-editor" onSubmit={(event) => void addTopic(event)}><label>Topic name<input maxLength={40} value={topicName} onChange={(event) => setTopicName(event.target.value)} required /></label><label>Keywords <small>Comma-separated, up to eight</small><input value={topicKeywords} onChange={(event) => setTopicKeywords(event.target.value)} /></label><div><button type="submit">Save topic</button><button type="button" onClick={() => setTopicEditorOpen(false)}>Cancel</button></div></form> : <button className="new-topic" disabled={demo || snapshot.topics.length >= 8} onClick={() => setTopicEditorOpen(true)}>Add a topic <small>{demo ? "Unavailable in demo mode" : snapshot.topics.length >= 8 ? "Eight-topic limit reached" : "Define the signals worth watching"}</small></button>}</div></section> : null}
        {snapshot && view === "connect" ? <section className="connect-view"><header className="view-title"><h1>Bring the signal to Omarchy.</h1><p>Desktop bridge · Contract v{snapshot.schemaVersion}</p></header><p>Listening Post receives this same priority field and keeps the last good snapshot when Perception is unavailable.</p><ol className="pairing-steps"><li><b>Install the free companion</b><code>omarchy plugin add https://github.com/jeremylongshore/omarchy-listening-post-entry --enable</code></li><li><b>Create a private device credential</b><span>One credential belongs to one workstation. Revoke it here if the machine or token leaves your control.</span></li><li><b>Run the connector, then refresh the bar</b><code>~/.config/omarchy/plugins/io.github.jeremylongshore.listening-post/connect-perception.sh</code></li></ol>{newDeviceToken ? <div className="token-reveal" role="status"><b>Copy this token now</b><code>{newDeviceToken}</code><small>Perception stores only its hash. This token will not be shown again.</small><button onClick={() => void copyToken()}>{tokenCopied ? "Copied" : "Copy token"}</button><small>Run the connector above and paste the token at its hidden prompt. Then refresh Listening Post from the bar or press r.</small><button className="token-finish" onClick={() => setNewDeviceToken(null)}>I finished connecting</button></div> : null}{devices.map((device) => <div className="device-card" key={device.id}><div><span className="pulse" /><b>{device.label}</b><small>{device.lastSeenAt ? `Last seen ${relativeTime(device.lastSeenAt)}` : "Created, but not seen by the API yet"}</small></div><button onClick={() => void removeDevice(device.id)}>Revoke</button></div>)}{devices.length === 0 && !newDeviceToken ? <div className="device-card"><div><span className="idle-dot" /><b>No device paired</b><small>{demo ? "Pairing is unavailable in the demo snapshot." : "Create a credential for one Omarchy workstation."}</small></div><button disabled={demo} onClick={() => void pairDevice()}>Create device credential</button></div> : null}{devices.length > 0 && !demo ? <button className="secondary-action" onClick={() => void pairDevice()}>Pair another device</button> : null}</section> : null}
        {snapshot && view === "account" ? <section className="account-view"><header className="view-title"><h1>Your account</h1><p>Access and recovery</p></header><div className="account-record"><div><span>Purchase email</span><b>{account?.email ?? "Loading account…"}</b></div><div><span>Access</span><b>{account?.entitlement?.entitled ? "Active" : account?.entitlement?.status ?? "Checking"}</b></div><div><span>Paired devices</span><b>{devices.length} of 8</b></div></div><div className="account-actions">{account?.entitlement?.customerPortalUrl ? <a href={account.entitlement.customerPortalUrl}>Manage billing and cancellation</a> : <span>Customer portal link is not available yet.</span>}<a href="?page=support">Get support</a><a href="?page=privacy">Privacy</a><a href="?page=terms">Terms</a><a href="?page=acceptable-use">Acceptable use</a><button onClick={() => void signOut()}>Sign out of this browser</button></div>{!onboardingOpen ? <button className="secondary-action" onClick={() => setOnboardingOpen(true)}>Show first-field guide</button> : null}</section> : null}
      </main>
    </div>
  );
}
