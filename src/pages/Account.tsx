import { useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { BookingSummary, Empty, Field, MockNote, Modal, StatusPill, freshId, useTitle } from "../components/ui";
import { formatDate, formatWindow, money } from "../domain/format";
import { canCustomerCancel, canCustomerReschedule } from "../domain/lifecycle";
import { listSlots } from "../domain/scheduling";
import { useStore } from "../state/store";

export function AccountPage() {
  useTitle("Account");
  const { state, updateProfile, saveAddress, deleteAddress, resetDemo } = useStore();
  const session = state.session;
  const customer = state.customers.find((item) => item.id === session?.customerId);
  const [tab, setTab] = useState<"bookings" | "addresses" | "profile">("bookings");
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [line1, setLine1] = useState("");
  const [postal, setPostal] = useState("");
  const [addrPhone, setAddrPhone] = useState(customer?.phone ?? "");
  if (!session) return <Navigate to="/login?next=/account" replace />;
  if (!customer) return <Navigate to="/" replace />;
  const mine = state.bookings.filter((booking) => booking.customerId === customer.id);
  const upcoming = mine.filter((booking) => booking.status !== "completed" && booking.status !== "cancelled");
  const past = mine.filter((booking) => booking.status === "completed" || booking.status === "cancelled");
  return (
    <div className="container page-block">
      <h1>Hello, {customer.name.split(" ")[0]}</h1>
      <div className="tabs" role="tablist" aria-label="Account">
        {(
          [
            ["bookings", "Bookings"],
            ["addresses", "Addresses"],
            ["profile", "Profile"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "bookings" ? (
        <div className="stack">
          <h2>Upcoming</h2>
          {upcoming.length === 0 ? <Empty title="No upcoming visits" body="When you confirm a booking, it will show here with its status and quote." action={<Link className="btn btn-secondary" to="/services">Find a service</Link>} /> : null}
          <BookingTable rows={upcoming} />
          <h2>History</h2>
          {past.length === 0 ? <p className="hint">Completed and cancelled visits will collect here.</p> : <BookingTable rows={past} />}
        </div>
      ) : null}
      {tab === "addresses" ? (
        <div className="split">
          <div className="stack">
            {customer.addresses.length === 0 ? <Empty title="No saved addresses" body="Add one for the next on-site visit." /> : null}
            {customer.addresses.map((address) => (
              <article key={address.id} className="panel">
                <h3>{address.label}</h3>
                <p>
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}
                  <br />
                  {address.postalCode} · {address.phone}
                </p>
                <button className="btn btn-ghost btn-small" type="button" onClick={() => deleteAddress(address.id)}>
                  Remove
                </button>
              </article>
            ))}
          </div>
          <form
            className="panel stack"
            onSubmit={(event) => {
              event.preventDefault();
              saveAddress({
                id: freshId("addr"),
                label: "Saved",
                line1,
                line2: "",
                landmark: "",
                postalCode: postal,
                contactName: customer.name,
                phone: addrPhone,
              });
            }}
          >
            <h2>Add an address</h2>
            <Field id="addr-line" label="Street address">
              <input id="addr-line" value={line1} onChange={(event) => setLine1(event.target.value)} />
            </Field>
            <Field id="addr-pin" label="Postal code">
              <input id="addr-pin" value={postal} onChange={(event) => setPostal(event.target.value)} inputMode="numeric" maxLength={6} />
            </Field>
            <Field id="addr-phone" label="Mobile number">
              <input id="addr-phone" value={addrPhone} onChange={(event) => setAddrPhone(event.target.value)} inputMode="tel" />
            </Field>
            <button className="btn btn-primary" type="submit">
              Save address
            </button>
          </form>
        </div>
      ) : null}
      {tab === "profile" ? (
        <form
          className="panel narrow stack"
          onSubmit={(event) => {
            event.preventDefault();
            updateProfile({ name, phone });
          }}
        >
          <Field id="profile-name" label="Name">
            <input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field id="profile-email" label="Email" hint="Demo sign-in email. It is not editable.">
            <input id="profile-email" value={customer.email} readOnly />
          </Field>
          <Field id="profile-phone" label="Mobile number">
            <input id="profile-phone" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
          </Field>
          <button className="btn btn-primary" type="submit">
            Save profile
          </button>
          <button className="btn btn-ghost" type="button" onClick={resetDemo}>
            Reset demo data
          </button>
          <MockNote>Reset restores sample bookings on this browser and signs you out.</MockNote>
        </form>
      ) : null}
    </div>
  );
}

function BookingTable({ rows }: { rows: ReturnType<typeof useStore>["state"]["bookings"] }) {
  const { state } = useStore();
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Bookings</caption>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Service</th>
            <th>When</th>
            <th>Status</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((booking) => {
            const service = state.services.find((item) => item.id === booking.serviceId);
            const window = state.settings.windows.find((item) => item.id === booking.windowId);
            return (
              <tr key={booking.id}>
                <td>
                  <Link to={`/bookings/${booking.id}`}>{booking.ref}</Link>
                </td>
                <td>{service?.name}</td>
                <td>
                  {formatDate(booking.date)}
                  {window ? ` · ${formatWindow(window)}` : ""}
                </td>
                <td>
                  <StatusPill status={booking.status} />
                </td>
                <td>{money(booking.quote.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BookingDetailPage() {
  const { bookingId } = useParams();
  const location = useLocation();
  const { state, cancelBooking, rescheduleBooking } = useStore();
  const booking = state.bookings.find((item) => item.id === bookingId);
  useTitle(booking?.ref ?? "Booking");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [slotKey, setSlotKey] = useState("");
  if (!state.session) return <Navigate to={`/login?next=/bookings/${bookingId ?? ""}`} replace />;
  if (!booking || booking.customerId !== state.session.customerId) {
    return <div className="container page-block"><Empty title="Booking not on this account" body="Customers only see their own visits." /></div>;
  }
  const justBooked = Boolean((location.state as { justBooked?: boolean } | null)?.justBooked);
  const now = new Date();
  const cancel = canCustomerCancel(booking, state.settings, now);
  const move = canCustomerReschedule(booking, state.settings, now);
  const slots = listSlots(
    state,
    { serviceId: booking.serviceId, zoneId: booking.zoneId, mode: booking.mode, deviceType: booking.deviceType },
    now,
    8,
  ).filter((slot) => slot.decision.ok && `${slot.date}|${slot.window.id}` !== `${booking.date}|${booking.windowId}`);
  return (
    <div className="container page-block narrow">
      {justBooked ? <p className="banner banner-ok">Booking stored in this demo. No payment was taken.</p> : null}
      <BookingSummary booking={booking} audience="customer" />
      <div className="row-actions">
        <button className="btn btn-secondary" type="button" disabled={!move.allowed} onClick={() => setMoveOpen(true)}>
          Reschedule
        </button>
        <button className="btn btn-danger" type="button" disabled={!cancel.allowed} onClick={() => setCancelOpen(true)}>
          Cancel
        </button>
      </div>
      <p className="hint">{move.allowed ? move.reason : move.reason}</p>
      {!cancel.allowed ? <p className="hint">{cancel.reason}</p> : null}
      {moveOpen ? (
        <Modal title="Choose a new window" onClose={() => setMoveOpen(false)}>
          {slots.length === 0 ? <Empty title="No other windows" body="Every other open slot is full or outside the rules." /> : null}
          <div className="slot-grid">
            {slots.map((slot) => {
              const key = `${slot.date}|${slot.window.id}`;
              return (
                <label key={key} className="slot">
                  <input type="radio" name="move" checked={slotKey === key} onChange={() => setSlotKey(key)} />
                  <span>
                    <strong>
                      {formatDate(slot.date)} · {formatWindow(slot.window)}
                    </strong>
                  </span>
                </label>
              );
            })}
          </div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!slotKey}
            onClick={() => {
              const [date, windowId] = slotKey.split("|");
              if (!date || !windowId) return;
              const result = rescheduleBooking(booking.id, date, windowId);
              if (result.ok) setMoveOpen(false);
            }}
          >
            Confirm new window
          </button>
        </Modal>
      ) : null}
      {cancelOpen ? (
        <Modal title={`Cancel ${booking.ref}?`} onClose={() => setCancelOpen(false)}>
          <Field id="cancel-reason" label="Reason">
            <textarea id="cancel-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <MockNote>No refund is due because no payment was collected.</MockNote>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              const result = cancelBooking(booking.id, reason);
              if (result.ok) setCancelOpen(false);
            }}
          >
            Cancel visit
          </button>
        </Modal>
      ) : null}
    </div>
  );
}
