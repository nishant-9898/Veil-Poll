"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Subscription } from "rxjs";
import { VEILPOLL_CONTRACT_ADDRESS } from "@/lib/midnight/constants";
import { createPreviewPublicDataProvider } from "@/lib/midnight/client";
import type { PollHandle, PollState } from "@/lib/midnight/polls";

type Notice = { tone: "error" | "success" | "info"; text: string } | null;

const short = (value: string) =>
  value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

const errorText = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error);
  if (/already voted/i.test(text)) return "This private identity already voted in this poll.";
  if (/wallet|authorized|connector|1AM/i.test(text)) return "1AM wallet connection failed.";
  return text;
};

export default function PollApp() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const requestedContract = params.get("contract");
    if (
      requestedContract &&
      requestedContract.replace(/^0x/i, "").toLowerCase() !== VEILPOLL_CONTRACT_ADDRESS
    ) {
      return {
        tone: "error",
        text: "This app only uses the fixed VeilPoll Preview contract.",
      };
    }
    return null;
  });
  const [polls, setPolls] = useState<PollState[]>([]);
  const [activePollId, setActivePollId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("poll")?.toLowerCase() ?? null;
  });
  const [handle, setHandle] = useState<PollHandle | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const subscriptionRef = useRef<Subscription | null>(null);

  const active = useMemo(
    () => polls.find((item) => item.pollId === activePollId) ?? null,
    [polls, activePollId],
  );
  const totalPolls = polls.length;

  const pollLink = useMemo(() => {
    if (!active || typeof window === "undefined") return "";
    const params = new URLSearchParams({ poll: active.pollId });
    return `${window.location.origin}/?${params}`;
  }, [active]);

  useEffect(() => () => subscriptionRef.current?.unsubscribe(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { dashboardPolls$ } = await import("@/lib/midnight/polls");
      if (cancelled) return;
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = dashboardPolls$(
        { publicDataProvider: createPreviewPublicDataProvider() },
        VEILPOLL_CONTRACT_ADDRESS,
      ).subscribe({
        next: (items) => {
          setPolls(items);
        },
        error: (error) => setNotice({ tone: "error", text: errorText(error) }),
      });
    })();
    return () => {
      cancelled = true;
      subscriptionRef.current?.unsubscribe();
    };
  }, []);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setNotice(null);
    try {
      await task();
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error) });
    } finally {
      setBusy("");
    }
  };

  const connect = () =>
    run("Connecting wallet", async () => {
      const { connectProviders } = await import("@/lib/midnight/client");
      const { joinRegistry } = await import("@/lib/midnight/polls");
      await connectProviders();
      const joined = await joinRegistry(VEILPOLL_CONTRACT_ADDRESS);
      setHandle(joined.handle);
      setConnected(true);
      setNotice({ tone: "success", text: "1AM connected to Midnight Preview." });
    });

  const createPoll = () =>
    run("Generating private proof", async () => {
      if (!handle) throw new Error("Connect 1AM first.");
      const cleaned = options.map((option) => option.trim()).filter(Boolean);
      if (question.trim().length < 5) throw new Error("Question needs at least 5 characters.");
      if (cleaned.length < 2) throw new Error("Add at least two options.");

      const { createPoll: submitPoll } = await import("@/lib/midnight/polls");
      const created = await submitPoll(handle, VEILPOLL_CONTRACT_ADDRESS, {
        question: question.trim(),
        options: cleaned,
      });

      setCreating(false);
      setQuestion("");
      setOptions(["", ""]);
      setActivePollId(created.pollId);
      setNotice({ tone: "success", text: `Poll created · ${short(created.txHash)}` });
    });

  const vote = () =>
    run("Generating private proof", async () => {
      if (!handle || !active || selected === null) throw new Error("Choose an option first.");
      const { castVote } = await import("@/lib/midnight/polls");
      const tx = await castVote(handle, active.pollId, selected);
      setNotice({ tone: "success", text: `Vote finalized · ${short(tx)}` });
      setSelected(null);
    });

  const close = () =>
    run("Closing poll", async () => {
      if (!handle || !active) return;
      const { closePoll } = await import("@/lib/midnight/polls");
      await closePoll(handle, active.pollId);
      setNotice({ tone: "success", text: "Poll closed. Final totals remain on-chain." });
    });

  const copyLink = async () => {
    if (!pollLink) return;
    await navigator.clipboard.writeText(pollLink);
    setNotice({ tone: "success", text: "Poll link copied." });
  };

  const activePoll = active;

  return (
    <main className="shell">
      <header className="topbar">
        <button className="brand" onClick={() => setCreating(false)} aria-label="VeilPoll home">
          <span className="brand-mark"><span /></span>
          <span>Veil<span>Poll</span></span>
        </button>
        <div className="top-actions">
          <span className="network"><i /> Midnight Preview</span>
          <button className={connected ? "wallet connected" : "wallet"} onClick={connect} disabled={Boolean(busy)}>
            <WalletIcon />
            {connected ? "1AM connected" : "Connect 1AM"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <button className="primary-action" onClick={() => setCreating(true)}>
            <PlusIcon /> Create poll
          </button>
          <nav aria-label="Existing polls">
            <p className="nav-label">Existing polls</p>
            {polls.length === 0 ? (
              <p className="empty-nav">
                {connected ? "No polls found yet on Preview." : "Connect 1AM to load the dashboard."}
              </p>
            ) : (
              polls.map((reference, index) => (
                <button
                  key={reference.pollId}
                  className={`poll-nav ${activePollId === reference.pollId ? "active" : ""}`}
                  onClick={() => {
                    setCreating(false);
                    setActivePollId(reference.pollId);
                  }}
                >
                  <span className="poll-index">{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    <b>{reference.question || "Midnight poll"}</b>
                    <small>{short(reference.pollId)}</small>
                  </span>
                </button>
              ))
            )}
          </nav>
          <div className="privacy-note">
            <ShieldIcon />
            <div>
              <b>Identity stays local</b>
              <p>Proof reveals poll-scoped nullifier, never wallet address.</p>
            </div>
          </div>
        </aside>

        <section className="stage">
          {notice && (
            <div className={`notice ${notice.tone}`} role="status">
              {notice.text}
              <button onClick={() => setNotice(null)}>×</button>
            </div>
          )}
          {busy && (
            <div className="progress">
              <span />
              {busy}…
            </div>
          )}

          {creating ? (
            <section className="form-panel compact-panel dashboard-form">
              <p className="eyebrow">Create poll</p>
              <h1>New poll.</h1>
              <p className="lede">This creates a poll inside the fixed Preview contract, then it appears on the dashboard.</p>
              <label>
                Question
                <textarea
                  value={question}
                  maxLength={180}
                  placeholder="What should we decide?"
                  onChange={(event) => setQuestion(event.target.value)}
                />
              </label>
              <div className="options-editor">
                <div className="field-title">
                  <span>Options</span>
                  <small>{options.length}/4</small>
                </div>
                {options.map((option, index) => (
                  <label className="option-input" key={index}>
                    <span>{String.fromCharCode(65 + index)}</span>
                    <input
                      value={option}
                      maxLength={80}
                      placeholder={`Option ${index + 1}`}
                      onChange={(event) =>
                        setOptions((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index ? event.target.value : item,
                          ),
                        )
                      }
                    />
                    {options.length > 2 && (
                      <button
                        onClick={() =>
                          setOptions((items) =>
                            items.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        aria-label={`Remove option ${index + 1}`}
                      >
                        ×
                      </button>
                    )}
                  </label>
                ))}
                {options.length < 4 && (
                  <button className="add-option" onClick={() => setOptions((items) => [...items, ""])}>
                    + Add option
                  </button>
                )}
              </div>
              <div className="form-footer">
                <button className="text-button" onClick={() => setCreating(false)}>Cancel</button>
                <button className="publish" onClick={createPoll} disabled={Boolean(busy)}>
                  Create poll <ArrowIcon />
                </button>
              </div>
            </section>
          ) : activePoll ? (
            <section className="poll-panel">
              <div className="poll-heading">
                <div>
                  <p className="eyebrow">
                    <span className={activePoll.closed ? "status-dot closed" : "status-dot"} />
                    {activePoll.closed ? "Closed poll" : "Voting open"}
                  </p>
                  <h1>{activePoll.question}</h1>
                </div>
                <button className="share" onClick={copyLink}>
                  <LinkIcon /> Share poll
                </button>
              </div>
              <div className="contract-line">
                <span>Poll</span>
                <code>{short(activePoll.pollId)}</code>
                <span>·</span>
                <span>
                  {Number(activePoll.totalVotes)} {Number(activePoll.totalVotes) === 1 ? "ballot" : "ballots"}
                </span>
              </div>
              <div className="ballot">
                {activePoll.options.map((option, index) => {
                  const votes = Number(activePoll.votes[index] ?? BigInt(0));
                  const total = Number(activePoll.totalVotes ?? BigInt(0)) || 1;
                  const pct = Math.round((votes / total) * 100);
                  const open = !activePoll.closed && !activePoll.hasVoted;
                  return (
                    <button
                      key={index}
                      className={`choice ${selected === index ? "selected" : ""}`}
                      onClick={() => setSelected(index)}
                      disabled={!open}
                    >
                      <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
                      <span className="choice-copy">
                        <b>{option}</b>
                        <span className="result-bar">
                          <i style={{ width: `${pct}%` }} />
                        </span>
                      </span>
                      <span className="choice-result">
                        <b>{votes}</b>
                        <small>{pct}%</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="vote-footer">
                <div className="proof-copy">
                  <ShieldIcon />
                  <span>
                    <b>{activePoll.hasVoted ? "Vote already cast" : "1AM proof ready"}</b>
                    <small>{activePoll.closed ? "Poll is closed." : "Identity remains local."}</small>
                  </span>
                </div>
                {!activePoll.closed && (
                  <button className="outline-button vote-button" onClick={vote} disabled={Boolean(busy) || selected === null || activePoll.hasVoted}>
                    Cast vote
                  </button>
                )}
                {activePoll.isCreator && !activePoll.closed && (
                  <button className="outline-button close-button" onClick={close} disabled={Boolean(busy)}>
                    Close poll
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className="welcome dashboard-welcome">
              <div className="veil-orbit">
                <span className="orbit-one" />
                <span className="orbit-two" />
                <ShieldIcon />
              </div>
              <p className="eyebrow">One contract · unlimited polls</p>
              <h1>Dashboard for every poll.</h1>
              <p>Connect 1AM, create a poll, and every existing poll on Preview shows up here in one place.</p>
              <div>
                <button className="publish" onClick={() => setCreating(true)}>
                  Create poll <ArrowIcon />
                </button>
              </div>
            </section>
          )}

          {!creating && (
            <section className="dashboard-panel">
              <div className="dashboard-head">
                <div>
                  <p className="eyebrow">Existing polls</p>
                  <h2>{totalPolls ? `${totalPolls} live ${totalPolls === 1 ? "poll" : "polls"}` : "No polls yet"}</h2>
                </div>
                <button className="outline-button" onClick={() => setCreating(true)}>
                  Create poll
                </button>
              </div>
              {polls.length > 0 ? (
                <div className="dashboard-grid">
                  {polls.map((item) => (
                    <button
                      key={item.pollId}
                      className={`dashboard-card ${activePollId === item.pollId ? "active" : ""}`}
                      onClick={() => {
                        setCreating(false);
                        setActivePollId(item.pollId);
                      }}
                    >
                      <div className="dashboard-card-head">
                        <span className={item.closed ? "status-dot closed" : "status-dot"} />
                        <span>{item.closed ? "Closed" : "Open"}</span>
                        <code>{short(item.pollId)}</code>
                      </div>
                      <h3>{item.question}</h3>
                      <p>{item.options.join(" · ")}</p>
                      <div className="dashboard-card-foot">
                        <span>{Number(item.totalVotes)} votes</span>
                        <span>{item.hasVoted ? "Voted" : "Ready"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dashboard-empty">
                  <ShieldIcon />
                  <p>No on-chain polls found yet.</p>
                </div>
              )}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5h14a2 2 0 0 1 2 2v9H4a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h12v4" />
      <path d="M15 11h5v4h-5a2 2 0 1 1 0-4Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 20 5v6c0 5.2-3.4 9.2-8 11-4.6-1.8-8-5.8-8-11V5l8-3Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13" />
      <path d="M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11" />
    </svg>
  );
}
