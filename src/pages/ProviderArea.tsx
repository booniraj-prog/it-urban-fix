import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookingSummary, Empty, Field, Modal, StatusPill, useTitle } from "../components/ui";
import { WEEKDAYS, formatDate, formatWindow, money, todayISO } from "../domain/format";
import { providerActions } from "../domain/lifecycle";
import { jobWarnings } from "../domain/matching";
import { useStore } from "../state/store";
import type { WorkingHours } from "../types";

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
  return (
    <div className="page-block narrow">
      <Link to="/provider">Back to today</Link>
      <BookingSummary booking={booking} audience="provider" />
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
      {warnings.length ? <p className="hint">Progress stays locked until operations moves this job. You can still decline it.</p> : null}
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
  return (
    <div className="page-block">
      <h1>Availability</h1>
      <p>One job fits in a window. Travel buffer is {state.settings.travelBufferMinutes} minutes and is enforced when a window is too short.</p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          saveMyAvailability(hours, off, accepting);
        }}
      >
        <label className="choice">
          <input type="checkbox" checked={accepting} onChange={(event) => setAccepting(event.target.checked)} />
          Accept new jobs
        </label>
        <div className="table-wrap">
          <table>
            <caption>Working hours</caption>
            <thead>
              <tr>
                <th>Day</th>
                <th>Working</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((label, day) => {
                const row = hours.find((item) => item.day === day);
                return (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>
                      <input type="checkbox" checked={Boolean(row)} aria-label={`${label} working`} onChange={(event) => toggleDay(day, event.target.checked)} />
                    </td>
                    <td>
                      <input
                        type="time"
                        aria-label={`${label} start`}
                        disabled={!row}
                        value={row?.start ?? "09:00"}
                        onChange={(event) => setHours((current) => current.map((item) => (item.day === day ? { ...item, start: event.target.value } : item)))}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        aria-label={`${label} end`}
                        disabled={!row}
                        value={row?.end ?? "18:00"}
                        onChange={(event) => setHours((current) => current.map((item) => (item.day === day ? { ...item, end: event.target.value } : item)))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Field id="time-off" label="Add a day off">
          <input id="time-off" type="date" value={dayOff} onChange={(event) => setDayOff(event.target.value)} />
        </Field>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            if (dayOff && !off.includes(dayOff)) setOff((current) => [...current, dayOff].sort());
          }}
        >
          Add day off
        </button>
        <ul className="plain-list">
          {off.map((date) => (
            <li key={date}>
              {formatDate(date)}{" "}
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setOff((current) => current.filter((item) => item !== date))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-primary" type="submit">
          Save availability
        </button>
      </form>
    </div>
  );
}
