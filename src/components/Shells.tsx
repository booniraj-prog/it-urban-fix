import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { brand } from "../brand";
import { integrationNotes } from "../integrations/mocks";
import { useStore } from "../state/store";
import type { Role } from "../types";
import { Icon } from "./Icons";
import { Logo, Modal, NoticeBell, PostalChooser } from "./ui";

export function homeFor(role: Role): string {
  if (role === "admin") return "/ops";
  if (role === "provider") return "/provider";
  return "/";
}

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { state } = useStore();
  const location = useLocation();
  if (!state.session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (state.session.role !== role) return <Navigate to={homeFor(state.session.role)} replace />;
  return children;
}

export function CustomerShell() {
  const { state, signOut } = useStore();
  const [open, setOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const zone = state.zones.find((item) => item.id === state.coverage.zoneId);
  return (
    <div className="page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand-cluster">
            <Link to="/" aria-label={`${brand.name} home`}>
              <Logo />
            </Link>
            <button type="button" className="area-chip" onClick={() => setAreaOpen(true)}>
              <Icon name="pin" size={16} />
              {zone ? zone.name : state.coverage.status === "uncovered" ? state.coverage.postalCode : "Set area"}
            </button>
          </div>
          <button type="button" className="icon-btn nav-toggle" aria-expanded={open} aria-label="Menu" onClick={() => setOpen((value) => !value)}>
            <Icon name={open ? "close" : "menu"} />
          </button>
          <nav className={open ? "nav open" : "nav"} aria-label="Customer">
            <NavLink to="/services">Services</NavLink>
            {state.session?.role === "customer" ? <NavLink to="/account">Bookings</NavLink> : null}
            {state.session?.role === "provider" ? <NavLink to="/provider">Technician</NavLink> : null}
            {state.session?.role === "admin" ? <NavLink to="/ops">Operations</NavLink> : null}
            {state.session?.role === "customer" ? <span className="who-chip">{state.session.name}</span> : null}
            {state.session ? (
              <button type="button" className="btn btn-ghost btn-small" onClick={signOut}>
                Sign out
              </button>
            ) : (
              <Link className="btn btn-primary btn-small" to="/login">
                Sign in
              </Link>
            )}
            <NoticeBell />
          </nav>
        </div>
      </header>
      {state.session && state.session.role !== "customer" ? (
        <p className="role-banner">
          You are signed in as {state.session.name}. Booking and account pages belong to customer accounts.
        </p>
      ) : null}
      <main id="main">{<Outlet />}</main>
      <footer className="footer">
        <div>
          <Logo />
          <p>{brand.tagline}</p>
        </div>
        <p className="fine">{integrationNotes.storage} {integrationNotes.payments}</p>
        <Link to="/login">Customer, technician, and operations sign-in</Link>
      </footer>
      {areaOpen ? (
        <Modal title="Where do you need help?" onClose={() => setAreaOpen(false)}>
          <PostalChooser onDone={() => setAreaOpen(false)} />
        </Modal>
      ) : null}
    </div>
  );
}

export function ProviderShell() {
  const { state, signOut } = useStore();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <div className="shell shell-provider">
      <aside className="sidebar">
        <Link to="/provider" aria-label="Technician home">
          <Logo />
        </Link>
        <p className="side-kicker">Technician</p>
        <nav aria-label="Technician">
          <NavLink to="/provider" end>
            Today
          </NavLink>
          <NavLink to="/provider/profile">Profile</NavLink>
          <NavLink to="/provider/availability">Availability</NavLink>
        </nav>
        <div className="side-foot">
          <Link to="/provider/profile" className="who">
            <strong>{state.session?.name}</strong>
            <span>Technician</span>
          </Link>
          <NoticeBell />
          <button type="button" className="btn btn-ghost btn-small" onClick={signOut}>
            Sign out
          </button>
          <p className="side-note">Sample jobs stored in this browser.</p>
        </div>
      </aside>
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}

const opsLinks = [
  ["Overview", "/ops"],
  ["Areas", "/ops/areas"],
  ["Catalog", "/ops/catalog"],
  ["Dispatch", "/ops/dispatch"],
  ["Capacity", "/ops/capacity"],
  ["Bookings", "/ops/bookings"],
  ["Technicians", "/ops/providers"],
  ["Reports", "/ops/reports"],
  ["Roles", "/ops/roles"],
] as const;

export function OpsShell() {
  const { state, signOut } = useStore();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <div className="shell shell-ops">
      <aside className="sidebar">
        <Link to="/ops" aria-label="Operations home">
          <Logo />
        </Link>
        <p className="side-kicker">Operations</p>
        <nav aria-label="Operations">
          {opsLinks.map(([label, to]) => (
            <NavLink key={to} to={to} end={to === "/ops"}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">
            <strong>{state.session?.name}</strong>
            <span>Operations</span>
          </div>
          <NoticeBell />
          <button type="button" className="btn btn-ghost btn-small" onClick={signOut}>
            Sign out
          </button>
          <p className="side-note">Sample records. No payment is collected.</p>
        </div>
      </aside>
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
