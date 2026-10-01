import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { GoogleSignInButton } from "../components/GoogleSignIn";
import { homeFor } from "../components/Shells";
import { Icon } from "../components/Icons";
import { Field, MockNote, useTitle } from "../components/ui";
import { integrationNotes } from "../integrations/mocks";
import { useStore } from "../state/store";
import type { Role } from "../types";

const PRIMARY: { role: Role; email: string; title: string; copy: string }[] = [
  { role: "customer", email: "maya@techcare.demo", title: "Customer", copy: "Book visits and follow quotes." },
  { role: "provider", email: "arjun@techcare.demo", title: "Technician", copy: "Accept jobs and update progress." },
  { role: "admin", email: "leela@techcare.demo", title: "Operations", copy: "Run coverage, dispatch, and reports." },
];

export function LoginPage() {
  useTitle("Sign in");
  const { state, signIn, signInWithGoogle } = useStore();
  const [params] = useSearchParams();
  const [role, setRole] = useState<Role>("customer");
  const [email, setEmail] = useState("maya@techcare.demo");
  const [password, setPassword] = useState("demo");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  if (state.session) {
    const next = params.get("next");
    if (next && canUse(state.session.role, next)) return <Navigate to={next} replace />;
    return <Navigate to={homeFor(state.session.role)} replace />;
  }

  const selected = PRIMARY.find((item) => item.role === role) ?? PRIMARY[0]!;

  const enter = (value: string, secret: string, expected: Role) => {
    setError("");
    if (!value.trim()) {
      setError("Enter the demo email for the role you selected.");
      return;
    }
    if (!secret) {
      setError("Enter the demo password. Every sample account uses demo.");
      return;
    }
    const result = signIn(value, secret, expected);
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="container page-block signin-wrap">
      <section className="panel signin">
        <header>
          <h1>Sign in</h1>
          <p>Use a Google account, or a sample role.</p>
        </header>
        <GoogleSignInButton
          onIdentity={(identity) => {
            setError("");
            const result = signInWithGoogle(identity);
            if (!result.ok) setError(result.message);
          }}
        />
        <p className="signin-or">or a sample role</p>
        <div className="role-pick" role="group" aria-label="Choose a role">
          {PRIMARY.map((account) => (
            <button
              key={account.role}
              type="button"
              aria-pressed={role === account.role}
              onClick={() => {
                setRole(account.role);
                setEmail(account.email);
                setError("");
              }}
            >
              <strong>{account.title}</strong>
              <span>{account.copy}</span>
            </button>
          ))}
        </div>
        <p className="hint">
          {role === "provider"
            ? `${selected.email} · password demo. Neha Kapoor (neha@techcare.demo) already has a job in progress.`
            : `${selected.email} · password demo`}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            enter(email, password, role);
          }}
        >
          <Field id="email" label="Email">
            <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field id="password" label="Password">
            <div className="password-row">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                className="icon-btn"
                type="button"
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                data-tooltip={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} />
              </button>
            </div>
          </Field>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn btn-primary" type="submit">
            Sign in as {selected.title}
          </button>
        </form>
        <MockNote>{integrationNotes.auth}</MockNote>
      </section>
    </div>
  );
}

function canUse(role: Role, next: string): boolean {
  if (role === "admin") return next.startsWith("/ops");
  if (role === "provider") return next.startsWith("/provider");
  return !next.startsWith("/ops") && !next.startsWith("/provider");
}
