import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { brand } from "../brand";
import { coverageMessage, zoneHealth } from "../domain/coverage";
import { createId, cx, formatDate, formatDateTime, formatWindow, modeLabel, money, statusTone, tagLabel } from "../domain/format";
import { STATUS_LABEL } from "../domain/lifecycle";
import { jobWarnings } from "../domain/matching";
import { previewCardQuote } from "../domain/pricing";
import { listSlots, nextOpenSlot, recommendProviders } from "../domain/scheduling";
import { useStore } from "../state/store";
import type { Booking, Quote, Service } from "../types";
import { CategoryMark, Icon } from "./Icons";

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${brand.name}`;
  }, [title]);
}

export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" />
        <path d="M16 8v16M8 16h16" />
        <circle cx="16" cy="16" r="3.1" />
      </svg>
      <span>{brand.name}</span>
    </span>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function MockNote({ children }: { children: ReactNode }) {
  return <p className="mock-note">{children}</p>;
}

export function StatusPill({ status }: { status: Booking["status"] }) {
  return <span className={`status status-${statusTone(status)}`}>{STATUS_LABEL[status]}</span>;
}

export function Stars({ rating, count }: { rating: number; count?: number }) {
  return (
    <span className="stars" aria-label={`${rating.toFixed(1)} out of 5`}>
      <Icon name="star" size={16} />
      {rating.toFixed(1)}
      {typeof count === "number" ? <span className="fine"> ({count})</span> : null}
    </span>
  );
}

export function QuoteView({ quote, audience = "customer" }: { quote: Quote; audience?: "customer" | "ops" }) {
  return (
    <div className="quote">
      <div className="quote-head">
        <h3>{quote.summaryLabel}</h3>
        <strong>{money(quote.total)}</strong>
      </div>
      <ul>
        {quote.lines.map((line) => (
          <li key={line.id}>
            <div>
              <span>{line.label}</span>
              <em className={`kind kind-${line.kind}`}>{line.kind === "discount" ? "Discount" : line.kind === "tax" ? "Tax" : line.kind === "estimate" ? "Estimate" : "Fixed"}</em>
              {line.detail ? <small>{line.detail}</small> : null}
            </div>
            <b>{money(line.amount)}</b>
          </li>
        ))}
      </ul>
      {quote.discountMessage ? <p className="field-error">{quote.discountMessage}</p> : null}
      <p className="hint">{quote.disclaimer}</p>
      {audience === "ops" ? (
        <p className="hint">
          Platform commission {money(quote.commission)} on the pre-tax subtotal. Technician payout {money(quote.providerPayout)}. Customers do not see this split.
        </p>
      ) : null}
    </div>
  );
}

export function Timeline({ booking }: { booking: Booking }) {
  return (
    <ol className="timeline">
      {booking.timeline.map((event) => (
        <li key={event.id}>
          <div>
            <strong>{event.title}</strong>
            <span>
              {event.actor.name} · {event.actor.role} · {formatDateTime(event.at)}
            </span>
            {event.detail ? <p>{event.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function NoticeBell() {
  const { state, markNoticesRead } = useStore();
  const [open, setOpen] = useState(false);
  const mine = state.notices.filter((notice) => notice.userId === state.session?.userId);
  const unread = mine.filter((notice) => !notice.read).length;
  if (!state.session) return null;
  return (
    <div className="notice-wrap">
      <button
        type="button"
        className="icon-btn"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) markNoticesRead();
        }}
      >
        <Icon name="bell" />
        {unread ? <span className="dot">{unread}</span> : null}
      </button>
      {open ? (
        <div className="notice-pop" role="region" aria-label="Demo notifications">
          <MockNote>In-app demo only. No SMS or email is sent.</MockNote>
          {mine.length === 0 ? <p>No notices yet.</p> : null}
          <ul>
            {mine.slice(0, 6).map((notice) => (
              <li key={notice.id}>
                <strong>{notice.title}</strong>
                <p>{notice.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function PostalChooser({ onDone }: { onDone?: () => void }) {
  const { state, setPostal } = useStore();
  const [value, setValue] = useState(state.coverage.postalCode);
  const id = useId();
  const zone = state.zones.find((item) => item.id === state.coverage.zoneId);
  return (
    <form
      className="postal-form"
      onSubmit={(event) => {
        event.preventDefault();
        const result = setPostal(value);
        if (result.ok) onDone?.();
      }}
    >
      <Field id={id} label="Postal code" hint="Try 560038 for Indiranagar, or 400001 to see an area we do not cover.">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby={`${id}-hint`}
        />
      </Field>
      <button className="btn btn-primary" type="submit">
        Check coverage
      </button>
      {state.coverage.status === "covered" && zone ? (
        <p className="banner banner-ok" role="status">
          {zone.name} is covered. Travel radius {zone.travelRadiusKm} km · lead time {zone.leadTimeHours} hours.
          {zoneHealth(state.providers, zone) === "uncovered" ? " No technician is accepting work in this zone yet." : ""}
        </p>
      ) : null}
      {state.coverage.status === "uncovered" ? (
        <p className="banner banner-warn" role="status">
          {state.coverage.postalCode} is outside current zones. Slots stay hidden until operations adds it.
        </p>
      ) : null}
    </form>
  );
}

export function CoverageForm({ postal, serviceId }: { postal?: string; serviceId?: string }) {
  const { state, requestCoverage } = useStore();
  const customer = state.customers.find((item) => item.id === state.session?.customerId);
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [note, setNote] = useState("");
  const [code, setCode] = useState(postal || state.coverage.postalCode);
  const nameId = useId();
  const phoneId = useId();
  const noteId = useId();
  const pinId = useId();
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        requestCoverage({ postalCode: code, serviceId, name, phone, note });
      }}
    >
      <Field id={pinId} label="Postal code">
        <input id={pinId} value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" maxLength={6} />
      </Field>
      <Field id={nameId} label="Your name">
        <input id={nameId} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
      </Field>
      <Field id={phoneId} label="Mobile number">
        <input id={phoneId} value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" />
      </Field>
      <Field id={noteId} label="What should we know?" hint="Optional. This stays in the demo operations queue.">
        <textarea id={noteId} value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
      </Field>
      <button className="btn btn-secondary" type="submit">
        Request a coverage update
      </button>
    </form>
  );
}

export function ServiceCard({ service }: { service: Service }) {
  const { state } = useStore();
  const category = state.categories.find((item) => item.id === service.categoryId);
  const zone = state.zones.find((item) => item.id === state.coverage.zoneId) ?? null;
  const quote = previewCardQuote(service, zone, state.areaPrices, new Date(), state.settings.urgencyWithinHours);
  const blocked = zone ? coverageMessage(service, zone, zoneHealth(state.providers, zone)) : null;
  const next =
    zone && !blocked
      ? nextOpenSlot(
          listSlots(
            state,
            {
              serviceId: service.id,
              zoneId: zone.id,
              mode: service.modes[0] ?? "onsite",
              deviceType: service.deviceTypes[0] ?? "Laptop",
            },
            new Date(),
            8,
          ),
        )
      : undefined;
  return (
    <article className="service-card">
      <div className="card-top">
        <CategoryMark id={service.categoryId} />
        <div>
          <p className="eyebrow">{category?.name}</p>
          <h3>
            <Link to={`/services/${service.id}`}>{service.name}</Link>
          </h3>
        </div>
      </div>
      <p>{service.summary}</p>
      <div className="chip-row">
        <span className={`badge ${service.priceType === "fixed" ? "badge-fixed" : "badge-estimate"}`}>
          {service.priceType === "fixed" ? "Fixed price" : "Diagnosis first"}
        </span>
        {service.modes.map((mode) => (
          <span key={mode} className="badge badge-muted">
            {modeLabel(mode)}
          </span>
        ))}
        {service.requiredTag ? <span className="badge badge-muted">{tagLabel(service.requiredTag)}</span> : null}
      </div>
      <div className="card-meta">
        <Stars rating={service.rating} count={service.reviewCount} />
        <span>
          <Icon name="clock" size={16} /> {service.durationMinutes} min
        </span>
      </div>
      <p className="price">
        {quote.hasEstimate ? "From " : ""}
        {money(quote.total)}
      </p>
      <p className="fine">
        {service.modes.includes("onsite") && service.modes.includes("remote")
          ? "Shown for remote. On-site adds the area travel fee."
          : service.modes[0] === "onsite" && zone
            ? `Includes travel in ${zone.name}.`
            : "GST included in this figure."}
      </p>
      <p className="next-time">
        {!zone ? "Choose an area to see the next window." : blocked ? blocked : next ? `Next window ${formatDate(next.date)} · ${formatWindow(next.window)}` : "No open window in the next week."}
      </p>
      <Link className="btn btn-secondary btn-small" to={`/services/${service.id}`}>
        View details
      </Link>
    </article>
  );
}

export function BookingSummary({ booking, audience }: { booking: Booking; audience: "customer" | "provider" | "ops" }) {
  const { state } = useStore();
  const service = state.services.find((item) => item.id === booking.serviceId);
  const zone = state.zones.find((item) => item.id === booking.zoneId);
  const city = state.cities.find((item) => item.id === zone?.cityId);
  const provider = state.providers.find((item) => item.id === booking.providerId);
  const window = state.settings.windows.find((item) => item.id === booking.windowId);
  const warnings = provider ? jobWarnings(state, booking, provider) : [];
  return (
    <div className="stack">
      <div className="split-head">
        <div>
          <p className="eyebrow">{booking.ref}</p>
          <h2>{service?.name ?? "Service"}</h2>
        </div>
        <StatusPill status={booking.status} />
      </div>
      <div className="meta-grid">
        <p>
          <span>When</span>
          {formatDate(booking.date)}
          {window ? ` · ${formatWindow(window)}` : ""}
        </p>
        <p>
          <span>Where</span>
          {zone?.name}, {city?.name} · {booking.postalCode}
        </p>
        <p>
          <span>Visit</span>
          {modeLabel(booking.mode)} · {booking.deviceType}
        </p>
        <p>
          <span>Customer</span>
          {booking.customerName}
        </p>
      </div>
      <section>
        <h3>Issue</h3>
        <p>{booking.issue}</p>
        {booking.answers.length ? (
          <ul className="plain-list">
            {booking.answers.map((answer) => (
              <li key={answer.questionId}>
                <strong>{answer.label}:</strong> {answer.value}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {booking.mode === "onsite" && booking.address ? (
        <section>
          <h3>Address</h3>
          <p>
            {booking.address.contactName} · {booking.address.phone}
            <br />
            {booking.address.line1}
            {booking.address.line2 ? `, ${booking.address.line2}` : ""}
            <br />
            {booking.address.landmark ? `${booking.address.landmark} · ` : ""}
            {booking.address.postalCode}
          </p>
        </section>
      ) : null}
      {booking.remoteContact ? (
        <section>
          <h3>Remote session</h3>
          <p>
            {booking.remoteContact.channel} · {booking.remoteContact.phone}
            {booking.remoteContact.notes ? ` · ${booking.remoteContact.notes}` : ""}
          </p>
          <MockNote>No call is placed. These details are stored for the technician.</MockNote>
        </section>
      ) : null}
      {provider ? (
        <section>
          <h3>Technician</h3>
          <p>
            {provider.name} · {provider.headline}
            <br />
            <Stars rating={provider.rating} /> · {provider.verification} · {provider.acceptingWork ? "Accepting work" : "Paused"}
          </p>
          {!booking.accepted && booking.status === "assigned" ? <p className="hint">Assigned, and still waiting for the technician to accept.</p> : null}
          {warnings.length ? (
            <div className="banner banner-warn">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <p className="banner banner-info">No technician is assigned yet. Operations matches skills, area, and the open window.</p>
      )}
      <QuoteView quote={booking.quote} audience={audience === "ops" ? "ops" : "customer"} />
      {audience === "ops" && booking.internalNote ? (
        <p>
          <strong>Internal note.</strong> {booking.internalNote}
        </p>
      ) : null}
      {audience === "ops" && booking.assignmentHistory.length ? (
        <section>
          <h3>Assignment record</h3>
          <ul className="plain-list">
            {booking.assignmentHistory.map((event) => (
              <li key={event.id}>
                {formatDateTime(event.at)} · {event.actorName}: {event.note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h3>Activity</h3>
        <Timeline booking={booking} />
      </section>
    </div>
  );
}

export function AssignPanel({ booking }: { booking: Booking }) {
  const { state, assignProvider } = useStore();
  const fits = recommendProviders(state, booking, new Date());
  const eligible = fits.filter((fit) => fit.eligible);
  const others = fits.filter((fit) => !fit.eligible);
  const [pick, setPick] = useState(eligible[0]?.provider.id ?? "");
  const [open, setOpen] = useState(false);
  const chosen = fits.find((fit) => fit.provider.id === pick);
  return (
    <section className="stack">
      <h3>Dispatch</h3>
      {eligible.length === 0 ? (
        <div className="banner banner-danger">No suitable technician is free for this window. Adjust coverage, hours, or the appointment before assigning.</div>
      ) : (
        <div className="stack">
          {eligible.map((fit, index) => (
            <label key={fit.provider.id} className={cx("rec", pick === fit.provider.id && "selected")}>
              <input type="radio" name={`assign-${booking.id}`} checked={pick === fit.provider.id} onChange={() => setPick(fit.provider.id)} />
              <span>
                <strong>
                  {fit.provider.name}
                  {index === 0 ? " · Recommended" : ""}
                </strong>
                <small>{fit.reasons.slice(0, 4).join(" · ")}</small>
              </span>
            </label>
          ))}
          <button className="btn btn-primary" type="button" disabled={!chosen} onClick={() => setOpen(true)}>
            Review assignment
          </button>
        </div>
      )}
      {others.length ? (
        <details>
          <summary>Not a fit ({others.length})</summary>
          <ul className="plain-list">
            {others.map((fit) => (
              <li key={fit.provider.id}>
                <strong>{fit.provider.name}.</strong> {fit.blockers[0]}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {open && chosen ? (
        <Modal title={`Assign ${chosen.provider.name}?`} onClose={() => setOpen(false)}>
          <p>
            {booking.ref} will move to {chosen.provider.name}. {chosen.reasons.slice(0, 3).join(". ")}.
          </p>
          <MockNote>The customer and technician get an in-app notice only.</MockNote>
          <div className="row-actions">
            <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                const result = assignProvider(booking.id, chosen.provider.id);
                if (result.ok) setOpen(false);
              }}
            >
              Confirm assignment
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

export function freshId(prefix: string): string {
  return createId(prefix);
}
