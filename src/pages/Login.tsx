import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { homeFor } from "../components/Shells";
import { Field, MockNote, useTitle } from "../components/ui";
import { integrationNotes } from "../integrations/mocks";
import { useStore } from "../state/store";
import type { Role } from "../types";

const PRIMARY = [
  { email: "maya@techcare.demo", title: "Customer", copy: "Maya books visits and follows quotes." },
  { email: "arjun@techcare.demo", title: "Technician", copy: "Arjun accepts jobs and updates progress." },
  { email: "leela@techcare.demo", title: "Operations", copy: "Leela runs coverage, dispatch, and capacity." },
];

export function LoginPage() {
  useTitle("Sign in");
  const { state, signIn } = useStore();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState("");
  if (state.session) {
    const next = params.get("next");
    if (next && canUse(state.session.role, next)) return <Navigate to={next} replace />;
    return <Navigate to={homeFor(state.session.role)} replace />;
  }

  const enter = (value: string, secret = "demo") => {
    const result = signIn(value, secret);
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="container page-block narrow">
      <h1>Sign in to the demo</h1>
      <p>Each role has its own navigation. Password for every sample account is demo.</p>
      <div className="card-grid">
        {PRIMARY.map((account) => (
          <button key={account.email} className="category-card" type="button" onClick={() => enter(account.email)}>
            <h2>{account.title}</h2>
            <p>{account.copy}</p>
            <span className="fine">{account.email}</span>
          </button>
        ))}
      </div>
      <details className="panel">
        <summary>Another technician account</summary>
        <p>Neha Kapoor has an in-progress Wi-Fi job. Email neha@techcare.demo.</p>
        <button className="btn btn-secondary" type="button" onClick={() => enter("neha@techcare.demo")}>
          Sign in as Neha
        </button>
      </details>
      <form
        className="panel stack"
        onSubmit={(event) => {
          event.preventDefault();
          enter(email, password);
        }}
      >
        <Field id="email" label="Email">
          <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field id="password" label="Password">
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button className="btn btn-primary" type="submit">
          Sign in
        </button>
      </form>
      <MockNote>{integrationNotes.auth}</MockNote>
    </div>
  );
}

function canUse(role: Role, next: string): boolean {
  if (role === "admin") return next.startsWith("/ops");
  if (role === "provider") return next.startsWith("/provider");
  return !next.startsWith("/ops") && !next.startsWith("/provider");
}
