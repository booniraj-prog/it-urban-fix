import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GoogleSignInButton } from "../components/GoogleSignIn";
import { Empty, Field, Modal, QuoteView, Stars, StatusPill, Timeline, useTitle } from "../components/ui";
import { WEEKDAYS, formatDate, formatWindow, modeLabel, money, tagLabel, todayISO } from "../domain/format";
import { providerActions } from "../domain/lifecycle";
import { jobWarnings } from "../domain/matching";
import { useStore } from "../state/store";
import type { VisitMode, WorkingHours } from "../types";

export function ProviderHome() {
  useTitle("Today");
  const { state } = useStore();
  const provider = state.providers.find((item) => item.id === state.session?.providerId);
  if (!provider) return <Empty title="Profile missing" body="This sign-in is not linked to a technician." />;
  const jobs = state.bookings.filter((booking) => booking.providerId === provider.id && booking.status !== "cancelled");
  const todayKey = todayISO();
  const upcoming = jobs.filter((booking) => booking.status !== "completed");
  const done = jobs.filter((booking) => booking.status === "completed").length;
  return (
    <div className="page-block">
      <h1>{provider.name}</h1>
      <p>{provider.headline}</p>
      <div className="stat-grid">
        <article className="stat">
          <span>Open jobs</span>
          <strong>{upcoming.length}</strong>
        </article>
        <article className="stat">
          <span>Completed in the sample</span>
          <strong>{done}</strong>
        </article>
        <article className="stat">
          <span>Daily cap</span>
          <strong>{provider.maxJobsPerDay}</strong>
        </article>
        <article className="stat">
          <span>New work</span>
          <strong>{provider.acceptingWork ? "Open" : "Paused"}</strong>
        </article>
      </div>
      <h2>Your jobs</h2>
      {upcoming.length === 0 ? <Empty title="Nothing assigned" body="When operations assigns a job, it appears here." /> : null}
      <div className="stack">
        {upcoming.map((booking) => {
          const service = state.services.find((item) => item.id === booking.serviceId);
          const window = state.settings.windows.find((item) => item.id === booking.windowId);
          const warnings = jobWarnings(state, booking, provider);
          return (
            <article key={booking.id} className="panel">
              <div className="split-head">
                <div>
                  <p className="eyebrow">{booking.date === todayKey ? "Today" : formatDate(booking.date)}</p>
                  <h3>
                    <Link to={`/provider/jobs/${booking.id}`}>{booking.ref}</Link> · {service?.name}
                  </h3>
                  <p>
                    {window ? formatWindow(window) : booking.windowId} · {booking.customerName}
                  </p>
                </div>
                <StatusPill status={booking.status} />
              </div>
              {warnings.length ? <p className="banner banner-warn">{warnings[0]}</p> : null}
              <p className="fine">{money(booking.quote.total)} · {booking.quote.summaryLabel}</p>
              <Link className="btn btn-primary btn-small" to={`/provider/jobs/${booking.id}`}>
                {warnings.length ? "Review warning" : !booking.accepted && booking.status === "assigned" ? "Accept or decline" : "Update job"}
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function ProviderJobPage() {
  const { bookingId } = useParams();
  const { state, acceptJob, declineJob, advanceJob } = useStore();
  const booking = state.bookings.find((item) => item.id === bookingId);
  const provider = state.providers.find((item) => item.id === state.session?.providerId);
  useTitle(booking?.ref ?? "Job");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  if (!booking || !provider || booking.providerId !== provider.id) {
    return <Empty title="Job not on your schedule" body="You can only open jobs assigned to you." />;
  }
  const warnings = jobWarnings(state, booking, provider);
  const actions = providerActions(booking);
  const service = state.services.find((item) => item.id === booking.serviceId);
  const zone = state.zones.find((item) => item.id === booking.zoneId);
  const city = state.cities.find((item) => item.id === zone?.cityId);
  const window = state.settings.windows.find((item) => item.id === booking.windowId);
  const address = booking.address;
  const phone = address?.phone ?? booking.remoteContact?.phone;
  return (
    <div className="page-block narrow job-sheet">
      <Link className="text-link" to="/provider">Today</Link>
      <article className="panel job-hero">
        <div className="split-head">
          <div>
            <p className="eyebrow">{booking.ref}</p>
            <h1>{service?.name ?? "Job"}</h1>
            <p className="job-when">
              {formatDate(booking.date)}
              {window ? ` · ${formatWindow(window)}` : ""}
            </p>
          </div>
          <StatusPill status={booking.status} />
        </div>
        {warnings.length ? <p className="banner banner-warn">{warnings[0]}</p> : null}
        <div className="row-actions">
          {actions.map((action) =>
            action.kind === "decline" ? (
              <button key={action.id} className="btn btn-danger" type="button" onClick={() => setOpen(true)}>
                {action.label}
              </button>
            ) : (
              <button
                key={action.id}
                className="btn btn-primary"
                type="button"
                disabled={warnings.length > 0}
                onClick={() => {
                  if (action.kind === "accept") acceptJob(booking.id);
                  else if (action.next) advanceJob(booking.id, action.next);
                }}
              >
                {action.label}
              </button>
            ),
          )}
        </div>
        {warnings.length ? <p className="hint">Accept stays off until operations moves this job. Decline is still available.</p> : null}
      </article>
      <dl className="job-facts">
        <div>
          <dt>Where</dt>
          <dd>{[zone?.name, city?.name, booking.postalCode].filter(Boolean).join(" · ")}</dd>
        </div>
        <div>
          <dt>Visit</dt>
          <dd>
            {modeLabel(booking.mode)} · {booking.deviceType}
          </dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>
            {booking.customerName}
            {phone ? ` · ${phone}` : ""}
          </dd>
        </div>
        <div>
          <dt>Quote</dt>
          <dd>{money(booking.quote.total)}</dd>
        </div>
      </dl>
      <section className="panel">
        <h2>Issue</h2>
        <p>{booking.issue}</p>
        {booking.answers.length ? (
          <ul className="job-answers">
            {booking.answers.map((answer) => (
              <li key={answer.questionId}>
                <span>{answer.label}</span>
                {answer.value}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {booking.mode === "onsite" && address ? (
        <section className="panel">
          <h2>Address</h2>
          <p>
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}
            {address.landmark ? ` · ${address.landmark}` : ""}
          </p>
        </section>
      ) : null}
      {booking.remoteContact ? (
        <section className="panel">
          <h2>Remote</h2>
          <p>
            {booking.remoteContact.channel} · {booking.remoteContact.phone}
            {booking.remoteContact.notes ? ` · ${booking.remoteContact.notes}` : ""}
          </p>
        </section>
      ) : null}
      <details className="panel fold">
        <summary>Price details</summary>
        <QuoteView quote={booking.quote} />
      </details>
      <details className="panel fold">
        <summary>Activity ({booking.timeline.length})</summary>
        <Timeline booking={booking} />
      </details>
      {open ? (
        <Modal title="Decline this job?" onClose={() => setOpen(false)}>
          <Field id="decline" label="Reason">
            <textarea id="decline" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              const result = declineJob(booking.id, reason);
              if (result.ok) setOpen(false);
            }}
          >
            Hand back to operations
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

export function AvailabilityPage() {
  useTitle("Availability");
  const { state, saveMyAvailability } = useStore();
  const provider = state.providers.find((item) => item.id === state.session?.providerId);
  const [hours, setHours] = useState<WorkingHours[]>(provider?.workingHours ?? []);
  const [off, setOff] = useState<string[]>(provider?.timeOff ?? []);
  const [accepting, setAccepting] = useState(provider?.acceptingWork ?? false);
  const [dayOff, setDayOff] = useState("");
  if (!provider) return <Empty title="Profile missing" body="Sign in as a technician." />;
  const toggleDay = (day: number, enabled: boolean) => {
    setHours((current) => {
      if (!enabled) return current.filter((item) => item.day !== day);
      if (current.some((item) => item.day === day)) return current;
      return [...current, { day, start: "09:00", end: "18:00" }];
    });
  };
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  const invalid = hours.some((item) => !item.start || !item.end || item.start >= item.end);
  const sameHours = hours.length > 0 && hours.every((item) => item.start === hours[0]?.start && item.end === hours[0]?.end);
  const summary =
    hours.length === 0
      ? "No working days"
      : sameHours
        ? `${hours.length} days · ${hours[0]?.start}–${hours[0]?.end}`
        : `${hours.length} days · hours vary`;
  return (
    <div className="page-block avail">
      <header className="avail-head">
        <div>
          <h1>Availability</h1>
          <p>{summary}</p>
        </div>
        <p className={accepting ? "status status-ok" : "status status-warn"}>{accepting ? "Accepting jobs" : "Paused"}</p>
      </header>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (invalid) return;
          saveMyAvailability(hours, off, accepting);
        }}
      >
        <section className="panel avail-card">
          <div className="split-head">
            <div>
              <h2>New jobs</h2>
              <p className="hint">{accepting ? "You can be matched to open visits." : "Current jobs stay. New matches skip you."}</p>
            </div>
            <label className="choice">
              <input type="checkbox" checked={accepting} onChange={(event) => setAccepting(event.target.checked)} />
              {accepting ? "On" : "Off"}
            </label>
          </div>
        </section>
        <section className="panel avail-card">
          <h2>Working hours</h2>
          <p className="hint">A visit window has to sit inside these hours. Travel buffer is {state.settings.travelBufferMinutes} minutes.</p>
          <ul className="hours-list">
            {dayOrder.map((day) => {
              const label = WEEKDAYS[day] ?? "";
              const row = hours.find((item) => item.day === day);
              const bad = Boolean(row && (!row.start || !row.end || row.start >= row.end));
              return (
                <li key={label} className={row ? "hours-row" : "hours-row is-off"}>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={Boolean(row)}
                      aria-label={`${label} working`}
                      onChange={(event) => toggleDay(day, event.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                  {row ? (
                    <div className="hours-times">
                      <label>
                        <span>Start</span>
                        <input
                          type="time"
                          aria-label={`${label} start`}
                          value={row.start}
                          onChange={(event) =>
                            setHours((current) => current.map((item) => (item.day === day ? { ...item, start: event.target.value } : item)))
                          }
                        />
                      </label>
                      <label>
                        <span>End</span>
                        <input
                          type="time"
                          aria-label={`${label} end`}
                          value={row.end}
                          onChange={(event) =>
                            setHours((current) => current.map((item) => (item.day === day ? { ...item, end: event.target.value } : item)))
                          }
                        />
                      </label>
                      {bad ? <p className="field-error">End needs to be later than the start.</p> : null}
                    </div>
                  ) : (
                    <p className="hours-off">Off</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="panel avail-card">
          <h2>Days off</h2>
          <p className="hint">A booked job on that date has to move before the day off can be saved.</p>
          <div className="day-off-add">
            <Field id="time-off" label="Date">
              <input id="time-off" type="date" value={dayOff} onChange={(event) => setDayOff(event.target.value)} />
            </Field>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!dayOff || off.includes(dayOff)}
              onClick={() => {
                if (dayOff && !off.includes(dayOff)) setOff((current) => [...current, dayOff].sort());
                setDayOff("");
              }}
            >
              Add
            </button>
          </div>
          {off.length === 0 ? (
            <p className="hint">None scheduled.</p>
          ) : (
            <ul className="off-list">
              {off.map((date) => (
                <li key={date}>
                  <span>{formatDate(date)}</span>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setOff((current) => current.filter((item) => item !== date))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <button className="btn btn-primary" type="submit" disabled={invalid}>
          Save availability
        </button>
      </form>
    </div>
  );
}

const STATUS_WORD = { active: "Active", paused: "Paused", suspended: "Suspended" } as const;
const VERIFY_WORD = { verified: "Verified", pending: "Pending review", rejected: "Not verified" } as const;

export function ProviderProfilePage() {
  useTitle("Profile");
  const { state, saveTechnicianProfile, linkGoogle, unlinkGoogle } = useStore();
  const provider = state.providers.find((item) => item.id === state.session?.providerId);
  const account = state.users.find((item) => item.id === state.session?.userId);
  const [name, setName] = useState(provider?.name ?? "");
  const [headline, setHeadline] = useState(provider?.headline ?? "");
  const [phone, setPhone] = useState(provider?.phone ?? "");
  const [skills, setSkills] = useState<string[]>(provider?.skills ?? []);
  const [zoneIds, setZoneIds] = useState<string[]>(provider?.zoneIds ?? []);
  const [modes, setModes] = useState<VisitMode[]>(provider?.modes ?? []);
  const [devices, setDevices] = useState(provider?.deviceTypes.join(", ") ?? "");
  if (!provider || !account) return <Empty title="Profile missing" body="Sign in as a technician." />;
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((item) => item !== id));
  return (
    <div className="page-block narrow profile-page">
      <h1>Profile</h1>
      <p>{headline || provider.headline}</p>
      <dl className="job-facts">
        <div>
          <dt>Verification</dt>
          <dd>{VERIFY_WORD[provider.verification]}</dd>
        </div>
        <div>
          <dt>Rating</dt>
          <dd>
            <Stars rating={provider.rating} />
          </dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd>{STATUS_WORD[provider.status]}</dd>
        </div>
        <div>
          <dt>Daily cap</dt>
          <dd>{provider.maxJobsPerDay} jobs</dd>
        </div>
      </dl>
      <p className="hint">
        Work type: {provider.tags.map((tag) => tagLabel(tag)).join(", ")}. Operations sets verification, the daily cap, and work type.{" "}
        <Link to="/provider/availability">Edit availability</Link>
      </p>
      <section className="panel stack">
        <h2>Google sign-in</h2>
        {account.googleEmail ? (
          <>
            <p>Connected as {account.googleEmail}</p>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => unlinkGoogle()}>
              Disconnect
            </button>
          </>
        ) : (
          <GoogleSignInButton onIdentity={(identity) => linkGoogle(identity)} />
        )}
        <p className="hint">The connected Google account opens this technician profile. The demo password still works.</p>
      </section>
      <form
        className="panel stack"
        onSubmit={(event) => {
          event.preventDefault();
          saveTechnicianProfile({
            name,
            headline,
            phone,
            skills,
            zoneIds,
            modes,
            deviceTypes: devices.split(",").map((item) => item.trim()).filter(Boolean),
          });
        }}
      >
        <h2>What customers match on</h2>
        <Field id="tech-name" label="Name">
          <input id="tech-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
        </Field>
        <Field id="tech-headline" label="Headline">
          <input id="tech-headline" value={headline} onChange={(event) => setHeadline(event.target.value)} />
        </Field>
        <Field id="tech-phone" label="Mobile number">
          <input id="tech-phone" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" />
        </Field>
        <Field id="tech-email" label="Sign-in email" hint="Demo email. Google uses the address above when it is connected.">
          <input id="tech-email" value={account.email} readOnly />
        </Field>
        <fieldset>
          <legend>Skills</legend>
          <div className="check-grid">
            {state.services.map((service) => (
              <label key={service.id}>
                <input
                  type="checkbox"
                  checked={skills.includes(service.id)}
                  onChange={(event) => setSkills((current) => toggle(current, service.id, event.target.checked))}
                />
                {service.name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Areas</legend>
          <div className="check-grid">
            {state.zones.map((zone) => (
              <label key={zone.id}>
                <input
                  type="checkbox"
                  checked={zoneIds.includes(zone.id)}
                  onChange={(event) => setZoneIds((current) => toggle(current, zone.id, event.target.checked))}
                />
                {zone.name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Visit types</legend>
          <div className="check-grid">
            {(["onsite", "remote"] as VisitMode[]).map((mode) => (
              <label key={mode}>
                <input
                  type="checkbox"
                  checked={modes.includes(mode)}
                  onChange={(event) =>
                    setModes((current) => (event.target.checked ? [...current, mode] : current.filter((item) => item !== mode)))
                  }
                />
                {modeLabel(mode)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="tech-devices" label="Devices" hint="Comma separated. Leave blank to accept every device.">
          <input id="tech-devices" value={devices} onChange={(event) => setDevices(event.target.value)} />
        </Field>
        <button className="btn btn-primary" type="submit">
          Save profile
        </button>
      </form>
    </div>
  );
}
