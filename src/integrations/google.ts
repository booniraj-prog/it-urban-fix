import type { GoogleIdentity } from "../types";

const SCRIPT = "https://accounts.google.com/gsi/client";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdApi {
  initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

let loading: Promise<void> | null = null;

export function googleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
}

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("Google sign-in could not load. Check the network and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export async function verifyGoogleCredential(credential: string, clientId: string): Promise<GoogleIdentity> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) throw new Error("Google did not accept that sign-in. Try again.");
  const data = (await response.json()) as {
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
  };
  if (!data.sub || !data.email) throw new Error("Google did not return an email for this account.");
  if (data.aud !== clientId) throw new Error("This Google sign-in was issued for a different app.");
  if (data.iss !== "accounts.google.com" && data.iss !== "https://accounts.google.com") {
    throw new Error("Google did not issue this sign-in.");
  }
  if (data.email_verified !== "true" && data.email_verified !== true) {
    throw new Error("Google has not verified this email.");
  }
  return { sub: data.sub, email: data.email, name: data.name?.trim() || data.email };
}
