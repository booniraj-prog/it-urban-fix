import { useEffect, useRef, useState } from "react";
import { googleClientId, loadGoogleIdentity, verifyGoogleCredential } from "../integrations/google";
import type { GoogleIdentity } from "../types";

export function GoogleSignInButton({ onIdentity }: { onIdentity: (identity: GoogleIdentity) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const onIdentityRef = useRef(onIdentity);
  onIdentityRef.current = onIdentity;
  const [error, setError] = useState("");
  const clientId = googleClientId();

  useEffect(() => {
    if (!clientId || !host.current) return;
    let alive = true;
    loadGoogleIdentity()
      .then(() => {
        if (!alive || !host.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            void verifyGoogleCredential(response.credential, clientId)
              .then((identity) => {
                if (alive) onIdentityRef.current(identity);
              })
              .catch((reason: unknown) => {
                if (alive) setError(reason instanceof Error ? reason.message : "Google sign-in failed.");
              });
          },
        });
        host.current.replaceChildren();
        window.google.accounts.id.renderButton(host.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          width: Math.max(240, Math.min(400, host.current.clientWidth || 320)),
          logo_alignment: "left",
        });
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "Google sign-in could not load.");
      });
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (!clientId) {
    return (
      <div className="google-slot">
        <button
          className="btn btn-google"
          type="button"
          onClick={() => setError("Google sign-in is not connected on this copy of the demo.")}
        >
          <GoogleMark />
          Sign in with Google
        </button>
        {error ? (
          <p className="hint" role="status">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="google-slot">
      <div ref={host} />
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8c-.2 1.1-.8 2-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3C2.4 16 5.5 18 9 18z" />
      <path fill="#FBBC05" d="M3.9 10.7c-.2-.6-.3-1.2-.3-1.7s.1-1.2.3-1.7V5H.9C.3 6.2 0 7.6 0 9s.3 2.8.9 4l3-2.3z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6C13.5.9 11.4 0 9 0 5.5 0 2.4 2 0.9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
    </svg>
  );
}
