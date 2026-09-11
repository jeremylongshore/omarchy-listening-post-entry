import { useEffect, useMemo, useState } from "react";
import type { PerceptionSignal, PerceptionSnapshot } from "@listening-post/perception-contract";
import { ApiError, beginGitHubLogin, createDevice, isDemoMode, loadDevices, loadSnapshot, markSignalRead, revokeDevice, saveTopics, type Device } from "./api";

type View = "signals" | "brief" | "topics" | "connect";
const views = [
  { id: "signals", label: "Signals" }, { id: "brief", label: "Daily brief" },
  { id: "topics", label: "Topics" }, { id: "connect", label: "Omarchy" },
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
    <article className={`signal-row lane-${signal.lane}`}>
      <div className="signal-score" aria-label={`${signal.relevance} percent relevance`}><strong>{signal.relevance}</strong><span>match</span></div>
      <div className="signal-copy">
        <div className="signal-meta"><span>{signal.lane}</span><span>{signal.source}</span><time>{relativeTime(signal.publishedAt)}</time></div>
        <a href={signal.url} target="_blank" rel="noreferrer" onClick={onOpen}>{signal.title}</a>
      </div>
      <span className={signal.read ? "read-mark is-read" : "read-mark"} aria-label={signal.read ? "Read" : "Unread"} />
    </article>
  );
}

export function App() {
  const [view, setView] = useState<View>("signals");
  const [snapshot, setSnapshot] = useState<PerceptionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [newDeviceToken, setNewDeviceToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [topicEditorOpen, setTopicEditorOpen] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [topicKeywords, setTopicKeywords] = useState("");
  const demo = isDemoMode();

  useEffect(() => {
    const controller = new AbortController();
    loadSnapshot(controller.signal).then(setSnapshot).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        if (reason instanceof ApiError && reason.status === 401) setAuthRequired(true);
        else setError(reason instanceof Error ? reason.message : "Perception could not load.");
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!snapshot || demo) return;
    loadDevices().then(setDevices).catch(() => setDevices([]));
  }, [snapshot, demo]);

  async function pairDevice() {
    setNotice(null);
    try {
      const created = await createDevice("Omarchy workstation");
      setDevices((current) => [created.device, ...current]);
      setNewDeviceToken(created.token);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Device pairing failed."); }
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
  }

  const briefSignals = useMemo(() => {
    if (!snapshot) return [];
    const byId = new Map(snapshot.signals.map((signal) => [signal.id, signal]));
    return snapshot.brief.highlights.flatMap((highlight) => {
      const signal = byId.get(highlight.signalId);
      return signal ? [{ signal, reason: highlight.reason }] : [];
    });
  }, [snapshot]);
  const fieldDay = snapshot
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(snapshot.generatedAt))
    : "Current";
  const isStale = snapshot ? Date.now() > Date.parse(snapshot.staleAfter) : false;

  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="wordmark" href="#top" aria-label="Perception home"><span>PER</span>CEPTION</a>
        <div className="masthead-status"><span className={isStale ? "idle-dot" : "pulse"} /> {demo ? "Demo field" : isStale ? "Last good field" : "Priority field"} <b>{snapshot?.signals.length ?? "—"}</b></div>
        <span className="avatar" aria-label={demo ? "Demo account" : "Signed-in account"}>{snapshot?.account.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? "P"}</span>
      </header>
      <aside className="rail" aria-label="Primary navigation">
        <p>Signal room</p>
        {views.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.label.slice(0, 2).toUpperCase()}</span>{item.label}</button>)}
        <div className="rail-foot"><small>Contract v1</small><b>{demo ? "Demo snapshot" : "Account sync"}</b></div>
      </aside>
      <main id="top" className="workspace">
        <div className="signal-ribbon" aria-label="Current field status"><span>FIELD / {snapshot ? "LIVE" : "OPENING"}</span><div className="ribbon-track"><i /><i /><i /><i /><i /><i /><i /><i /></div><span>{snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span></div>
        {authRequired ? <section className="state-panel"><p>Your private field</p><h1>Bring your watchlist into focus.</h1><span>Sign in with GitHub to manage topics, read your brief, and connect Listening Post.</span><button onClick={beginGitHubLogin}>Continue with GitHub</button></section> : null}
        {error ? <section className="state-panel"><p>Connection interrupted</p><h1>The signal room could not open.</h1><span>{error}</span><button onClick={() => window.location.reload()}>Try again</button></section> : null}
        {notice ? <div className="inline-notice" role="alert">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div> : null}
        {!authRequired && !error && !snapshot ? <section className="state-panel"><p>Tuning sources</p><h1>Opening the signal room…</h1></section> : null}
        {snapshot && view === "signals" ? <><section className="page-intro"><div><p>{fieldDay} field note</p><h1>What changed<br />while you worked.</h1></div><div className="intro-note"><b>{snapshot.account.displayName},</b> your watchlist found {snapshot.signals.filter((signal) => !signal.read).length} unread signals across {snapshot.topics.filter((topic) => topic.enabled).length} active topics.</div></section>{isStale ? <div className="stale-note" role="status">Showing the last good field from {relativeTime(snapshot.generatedAt)}. Perception will replace it after a successful refresh.</div> : null}<section className="section-head"><h2>Priority field</h2><span>Ranked by operational impact + your topics</span></section>{snapshot.signals.length ? <div className="signal-list">{snapshot.signals.map((signal) => <SignalRow key={signal.id} signal={signal} onOpen={() => readSignal(signal.id)} />)}</div> : <div className="quiet-state"><b>The field is quiet.</b><span>No current signals crossed your topic threshold.</span></div>}<section className="source-health" aria-label="Source health"><h2>Source health</h2>{snapshot.sourceHealth.map((source) => <div key={source.id}><span className={source.status === "healthy" ? "pulse" : "idle-dot"} /><b>{source.name}</b><small>{source.status} · checked {relativeTime(source.checkedAt)}</small></div>)}</section></> : null}
        {snapshot && view === "brief" ? <section className="brief-view"><header className="view-title"><h1>The brief</h1><p>Last 24 hours · {briefSignals.length} linked highlights</p></header>{briefSignals.map(({ signal, reason }, index) => <article key={signal.id} className="brief-item"><b>{String(index + 1).padStart(2, "0")}</b><div><SignalRow signal={signal} onOpen={() => readSignal(signal.id)} /><p>{reason}</p></div></article>)}</section> : null}
        {snapshot && view === "topics" ? <section className="topics-view"><header className="view-title"><h1>Topics</h1><p>Your attention policy · {snapshot.topics.length} of 8 configured</p></header><div className="topic-grid">{snapshot.topics.map((topic) => <article key={topic.id}><span>{topic.enabled ? "Watching" : "Paused"}</span><h2>{topic.name}</h2><p>{topic.keywords.join(" · ")}</p>{demo ? <small>Editing is unavailable in the demo snapshot.</small> : <div className="topic-actions"><button className="topic-action" onClick={() => void toggleTopic(topic.id)}>{topic.enabled ? "Pause" : "Watch"}</button><button className="topic-action danger-action" onClick={() => void removeTopic(topic.id)}>Remove</button></div>}</article>)}{topicEditorOpen ? <form className="topic-editor" onSubmit={(event) => void addTopic(event)}><label>Topic name<input maxLength={40} value={topicName} onChange={(event) => setTopicName(event.target.value)} required /></label><label>Keywords <small>Comma-separated, up to eight</small><input value={topicKeywords} onChange={(event) => setTopicKeywords(event.target.value)} /></label><div><button type="submit">Save topic</button><button type="button" onClick={() => setTopicEditorOpen(false)}>Cancel</button></div></form> : <button className="new-topic" disabled={demo || snapshot.topics.length >= 8} onClick={() => setTopicEditorOpen(true)}>Add a topic <small>{demo ? "Unavailable in demo mode" : snapshot.topics.length >= 8 ? "Eight-topic limit reached" : "Define the signals worth watching"}</small></button>}</div></section> : null}
        {snapshot && view === "connect" ? <section className="connect-view"><header className="view-title"><h1>Bring the signal to Omarchy.</h1><p>Desktop bridge · Contract v{snapshot.schemaVersion}</p></header><p>Listening Post receives this same priority field and keeps the last good snapshot when Perception is unavailable.</p>{newDeviceToken ? <div className="token-reveal" role="status"><b>Copy this token now</b><code>{newDeviceToken}</code><small>Perception stores only its hash. This token will not be shown again.</small><button onClick={() => setNewDeviceToken(null)}>I saved it</button></div> : null}{devices.map((device) => <div className="device-card" key={device.id}><div><span className="pulse" /><b>{device.label}</b><small>{device.lastSeenAt ? `Last seen ${relativeTime(device.lastSeenAt)}` : "Not used yet"}</small></div><button onClick={() => void removeDevice(device.id)}>Revoke</button></div>)}{devices.length === 0 && !newDeviceToken ? <div className="device-card"><div><span className="idle-dot" /><b>No device paired</b><small>{demo ? "Pairing is unavailable in the demo snapshot." : "Create a credential for one Omarchy workstation."}</small></div><button disabled={demo} onClick={() => void pairDevice()}>Pair a device</button></div> : null}{devices.length > 0 && !demo ? <button className="secondary-action" onClick={() => void pairDevice()}>Pair another device</button> : null}</section> : null}
      </main>
    </div>
  );
}
