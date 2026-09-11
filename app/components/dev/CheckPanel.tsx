"use client";
import { useEffect, useState } from "react";
import { passkeyEnvironmentProblem } from "@/src/account/errors";

// Dev page: says what this browser can do before anyone blames the app. The prompt test creates a
// throwaway passkey named "Viky device check" that the person can delete from their passkey manager.

type Facts = {
  userAgent: string;
  secureContext: boolean;
  webAuthn: boolean;
  platformAuthenticator: string;
  conditionalMediation: string;
  standalone: boolean;
  verdict: string;
};

export function CheckPanel() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const say = (line: string) => setLog((lines) => [...lines, `${new Date().toISOString().slice(11, 19)} ${line}`]);

  useEffect(() => {
    void Promise.resolve().then(probe);
  }, []);

  function probe() {
    const webAuthn = typeof window.PublicKeyCredential !== "undefined";
    const problem = passkeyEnvironmentProblem(navigator.userAgent, webAuthn);
    const base: Facts = {
      userAgent: navigator.userAgent,
      secureContext: window.isSecureContext,
      webAuthn,
      platformAuthenticator: "…",
      conditionalMediation: "…",
      standalone: window.matchMedia("(display-mode: standalone)").matches,
      verdict: problem ? `refused: ${problem}` : "allowed to try",
    };
    setFacts(base);
    if (!webAuthn) return;
    const pk = window.PublicKeyCredential;
    pk.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((ok) => setFacts((f) => (f ? { ...f, platformAuthenticator: String(ok) } : f)))
      .catch((e: unknown) => setFacts((f) => (f ? { ...f, platformAuthenticator: `error ${String(e)}` } : f)));
    const cm = (pk as unknown as { isConditionalMediationAvailable?: () => Promise<boolean> }).isConditionalMediationAvailable;
    if (typeof cm === "function") {
      cm.call(pk)
        .then((ok) => setFacts((f) => (f ? { ...f, conditionalMediation: String(ok) } : f)))
        .catch(() => setFacts((f) => (f ? { ...f, conditionalMediation: "error" } : f)));
    } else {
      setFacts((f) => (f ? { ...f, conditionalMediation: "not exposed" } : f));
    }
  }

  const testPrompt = async () => {
    const started = performance.now();
    say("calling navigator.credentials.create with the prf extension");
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { id: window.location.hostname, name: "Viky device check" },
          user: { id: userId, name: "Viky device check", displayName: "Viky device check" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: { residentKey: "required", userVerification: "required" },
          timeout: 60_000,
          extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;
      const elapsed = Math.round(performance.now() - started);
      if (!credential) {
        say(`prompt returned nothing after ${elapsed} ms`);
        return;
      }
      const ext = credential.getClientExtensionResults() as { prf?: { enabled?: boolean } };
      say(`passkey created in ${elapsed} ms; prf enabled: ${String(ext.prf?.enabled)}; authenticator attachment: ${String((credential as unknown as { authenticatorAttachment?: string }).authenticatorAttachment)}`);
    } catch (error) {
      const elapsed = Math.round(performance.now() - started);
      const e = error as { name?: string; message?: string };
      say(`prompt failed after ${elapsed} ms: ${e?.name ?? "Error"}: ${e?.message ?? String(error)}`);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold">Device check (dev)</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          What this browser can do with passkeys. The prompt test creates a throwaway passkey you can delete afterwards.
        </p>
      </header>
      {facts ? (
        <dl className="grid grid-cols-[11rem_1fr] gap-y-1 text-sm">
          <dt>Verdict</dt>
          <dd className="font-medium">{facts.verdict}</dd>
          <dt>Secure context</dt>
          <dd>{String(facts.secureContext)}</dd>
          <dt>WebAuthn present</dt>
          <dd>{String(facts.webAuthn)}</dd>
          <dt>Platform authenticator</dt>
          <dd>{facts.platformAuthenticator}</dd>
          <dt>Conditional mediation</dt>
          <dd>{facts.conditionalMediation}</dd>
          <dt>Installed (standalone)</dt>
          <dd>{String(facts.standalone)}</dd>
          <dt>User agent</dt>
          <dd className="break-all font-mono text-xs">{facts.userAgent}</dd>
        </dl>
      ) : null}
      <button type="button" onClick={() => void testPrompt()} className="rounded-lg bg-blue-600 px-4 py-2 text-white">
        Test the passkey prompt
      </button>
      <section className="rounded-2xl border border-gray-200 p-5 font-mono text-xs dark:border-gray-800">
        {log.length === 0 ? <p style={{ color: "var(--muted)" }}>log</p> : log.map((line, index) => <p key={index}>{line}</p>)}
      </section>
    </main>
  );
}
