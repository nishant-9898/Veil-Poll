"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VEILPOLL_CONTRACT_ADDRESS } from "@/lib/midnight/constants";
import type { ConnectedSession } from "@/lib/midnight/client";

const messageFor = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export default function DeployClient() {
  const [walletInstalled, setWalletInstalled] = useState<boolean | null>(null);
  const [session, setSession] = useState<ConnectedSession | null>(null);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pollId, setPollId] = useState("");
  const registryAddress = VEILPOLL_CONTRACT_ADDRESS;

  const pollLink = useMemo(() => {
    if (!registryAddress || !pollId || typeof window === "undefined") return "";
    const params = new URLSearchParams({ poll: pollId });
    return `${window.location.origin}/?${params}`;
  }, [registryAddress, pollId]);

  useEffect(() => {
    import("@/lib/midnight/client")
      .then(({ detect1AM }) => detect1AM())
      .then((wallet) => setWalletInstalled(Boolean(wallet)));
  }, []);

  const connect = async () => {
    setBusy("Connecting 1AM to Preview");
    setError("");
    try {
      const { connect1AM } = await import("@/lib/midnight/client");
      setSession(await connect1AM());
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy("");
    }
  };

  const create = async () => {
    if (!session) return;
    const cleaned = options.map((option) => option.trim()).filter(Boolean);
    if (question.trim().length < 5) {
      setError("Question needs at least 5 characters.");
      return;
    }
    if (cleaned.length < 2) {
      setError("Add at least two options.");
      return;
    }

    setError("");
    setBusy("1AM is proving and creating poll");
    try {
      const { createPoll, joinRegistry } = await import("@/lib/midnight/polls");
      const joined = await joinRegistry(registryAddress);
      const created = await createPoll(
        joined.handle,
        joined.contractAddress,
        {
          question: question.trim(),
          options: cleaned,
        },
      );
      setPollId(created.pollId);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy("");
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  if (walletInstalled === false) {
    return (
      <main className="deploy-shell">
        <header className="topbar">
          <Link className="brand" href="/"><span className="brand-mark"><span /></span><span>Veil<span>Poll</span></span></Link>
          <span className="network"><i /> Midnight Preview</span>
        </header>
        <section className="wallet-required">
          <p className="eyebrow">Browser transactions</p>
          <h1>1AM wallet required.</h1>
          <p>Install 1AM, switch it to Midnight Preview, then return here.</p>
          <a className="publish" href="https://1am.xyz" target="_blank" rel="noreferrer">Install 1AM <ArrowIcon /></a>
        </section>
      </main>
    );
  }

  return (
    <main className="deploy-shell">
      <header className="topbar">
        <Link className="brand" href="/"><span className="brand-mark"><span /></span><span>Veil<span>Poll</span></span></Link>
        <div className="top-actions">
          <span className="network"><i /> Midnight Preview</span>
          <button className={session ? "wallet connected" : "wallet"} onClick={connect} disabled={Boolean(busy)}>
            <WalletIcon />
            {session ? "1AM connected" : "Connect 1AM"}
          </button>
        </div>
      </header>

      {busy && <div className="deploy-progress" role="status"><span />{busy}</div>}

      <section className="deploy-stage">
        <div className="deploy-intro">
          <Link className="back-link" href="/">← Polls</Link>
          <p className="eyebrow">Shared contract · Preview</p>
          <h1>One contract.<br />Unlimited polls.</h1>
          <p>Every action here uses the fixed Preview contract and nothing else.</p>
          <div className="deploy-facts">
            <span><b>01</b> Connect wallet</span>
            <span><b>02</b> Create poll</span>
            <span><b>03</b> Share link</span>
          </div>
          {registryAddress && (
            <div className="session-card">
              <span>Active registry</span>
              <code>{registryAddress}</code>
              <small>Network · Preview</small>
            </div>
          )}
        </div>

        <section className="form-panel deploy-form">
          {!session && (
            <div className="connect-gate">
              <ShieldIcon />
              <h2>Connect before creating.</h2>
              <p>1AM proves, balances, and submits every Preview transaction.</p>
              <button className="publish" onClick={connect} disabled={Boolean(busy)}>Connect 1AM <ArrowIcon /></button>
            </div>
          )}

          {session && !pollId && (
            <>
              <p className="eyebrow">New poll in shared registry</p>
              <h2>What needs deciding?</h2>
              <label>Question<textarea value={question} maxLength={180} placeholder="What should we decide?" onChange={(event) => setQuestion(event.target.value)} /></label>
              <div className="options-editor">
                <div className="field-title"><span>Options</span><small>{options.length}/4</small></div>
                {options.map((option, index) => (
                  <label className="option-input" key={index}>
                    <span>{String.fromCharCode(65 + index)}</span>
                    <input value={option} maxLength={80} placeholder={`Option ${index + 1}`} onChange={(event) => setOptions((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
                    {options.length > 2 && <button onClick={() => setOptions((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove option ${index + 1}`}>×</button>}
                  </label>
                ))}
                {options.length < 4 && <button className="add-option" onClick={() => setOptions((items) => [...items, ""])}>+ Add option</button>}
              </div>
              <button className="publish deploy-button" onClick={create} disabled={Boolean(busy)}>Create poll on Preview <ArrowIcon /></button>
            </>
          )}

          {session && pollId && (
            <div className="deploy-success">
              <span className="success-seal confirmed"><ShieldIcon /></span>
              <p className="eyebrow">Confirmed on Preview</p>
              <h2>Poll created.</h2>
              <p>Share the poll link. The contract address is fixed for every transaction.</p>
              <div className="address-result">
                <span>Poll ID</span>
                <code>{pollId}</code>
                <button onClick={() => copy(pollId)}>Copy ID</button>
              </div>
              <div className="success-actions">
                <a className="publish" href={pollLink}>Open poll <ArrowIcon /></a>
                <button className="outline-button" onClick={() => {
                  setPollId("");
                  setQuestion("");
                  setOptions(["", ""]);
                }}>Create another</button>
              </div>
            </div>
          )}

          {error && <div className="deploy-error" role="alert">{error}</div>}
        </section>
      </section>
    </main>
  );
}

function WalletIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h14a2 2 0 0 1 2 2v9H4a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h12v4"/><path d="M15 11h5v4h-5a2 2 0 1 1 0-4Z"/></svg>; }
function ShieldIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 5v6c0 5.2-3.4 9.2-8 11-4.6-1.8-8-5.8-8-11V5l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>; }
function ArrowIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>; }
