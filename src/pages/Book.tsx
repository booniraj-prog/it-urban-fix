import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { homeFor } from "../components/Shells";
import { CoverageForm, Empty, Field, MockNote, PostalChooser, QuoteView, freshId, useTitle } from "../components/ui";
import { coverageMessage, zoneHealth } from "../domain/coverage";
import { atTime, cx, formatDate, formatWindow, modeLabel, money } from "../domain/format";
import { calculateQuote } from "../domain/pricing";
import { listSlots } from "../domain/scheduling";
import { useStore } from "../state/store";
import type { VisitMode } from "../types";

const STEPS = ["Area", "Issue", "Questions", "Visit", "Estimate", "Schedule", "Details", "Review"];

export function BookPage() {
  const { serviceId } = useParams();
  const { state, placeBooking } = useStore();
  const navigate = useNavigate();
  const service = state.services.find((item) => item.id === serviceId);
  useTitle(service ? `Book ${service.name}` : "Book");
  const session = state.session;
  const zone = state.zones.find((item) => item.id === state.coverage.zoneId) ?? null;
  const customer = state.customers.find((item) => item.id === session?.customerId);
  const [step, setStep] = useState(0);
  const [deviceType, setDeviceType] = useState(service?.deviceTypes[0] ?? "");
  const [issue, setIssue] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<VisitMode | "">("");
  const [parts, setParts] = useState("");
  const [code, setCode] = useState("");
  const [priority, setPriority] = useState(false);
  const [slotKey, setSlotKey] = useState("");
  const [addressId, setAddressId] = useState(customer?.addresses[0]?.id ?? "new");
  const [line1, setLine1] = useState(customer?.addresses[0]?.line1 ?? "");
  const [line2, setLine2] = useState(customer?.addresses[0]?.line2 ?? "");
  const [landmark, setLandmark] = useState(customer?.addresses[0]?.landmark ?? "");
  const [contactName, setContactName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [postal, setPostal] = useState(state.coverage.postalCode);
  const [channel, setChannel] = useState("Phone call");
  const [remoteNotes, setRemoteNotes] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");

  const blocked = service && zone ? coverageMessage(service, zone, zoneHealth(state.providers, zone)) : "Choose a covered area.";
  const modes = (service?.modes ?? []).filter((item) => zone?.enabledModes.includes(item));
  const selectedSlot = slotKey.split("|");
  const slotDate = selectedSlot[0] ?? "";
  const slotWindowId = selectedSlot[1] ?? "";
  const window = state.settings.windows.find((item) => item.id === slotWindowId);
  const partsEstimate = Number(parts || 0);

  const quote = useMemo(() => {
    if (!service || !zone || (mode !== "remote" && mode !== "onsite")) return null;
    return calculateQuote({
      service,
      zone,
      areaPrices: state.areaPrices,
      mode,
      partsEstimate: Number.isFinite(partsEstimate) ? partsEstimate : 0,
      discountCode: code,
      priority,
      slotStartsAt: window ? atTime(slotDate, window.start) : null,
      now: new Date(),
      urgencyWithinHours: state.settings.urgencyWithinHours,
    });
  }, [service, zone, state.areaPrices, state.settings.urgencyWithinHours, mode, partsEstimate, code, priority, window, slotDate]);

  const slots = useMemo(() => {
    if (!service || !zone || (mode !== "remote" && mode !== "onsite") || !deviceType) return [];
    return listSlots(state, { serviceId: service.id, zoneId: zone.id, mode, deviceType }, new Date(), 8);
  }, [state, service, zone, mode, deviceType]);

  if (!session) return <Navigate to={`/login?next=/book/${serviceId ?? ""}`} replace />;
  if (session.role !== "customer") return <Navigate to={homeFor(session.role)} replace />;
  if (!service) {
    return (
      <div className="container page-block">
        <Empty title="Service not found" body="Pick a service from the catalog first." action={<Link className="btn btn-secondary" to="/services">Browse services</Link>} />
      </div>
    );
  }

  const staffed = (visit: VisitMode) =>
    state.providers.some(
      (provider) =>
        provider.skills.includes(service.id) &&
        provider.zoneIds.includes(zone?.id ?? "") &&
        provider.modes.includes(visit) &&
        provider.status === "active" &&
        provider.acceptingWork &&
        provider.verification === "verified" &&
        (provider.deviceTypes.length === 0 || provider.deviceTypes.includes(deviceType)) &&
        (!service.requiredTag || provider.tags.includes(service.requiredTag)),
    );

  const go = (next: number) => {
    setError("");
    if (step === 0 && next > step) {
      if (!zone || blocked) {
        setError(blocked || "Check a covered postal code before continuing.");
        return;
      }
    }
    if (step === 1 && next > step) {
      if (!deviceType) return setError("Choose a device.");
      if (issue.trim().length < 12) return setError("Describe the issue in at least a sentence.");
    }
    if (step === 3 && next > step) {
      if (mode !== "remote" && mode !== "onsite") return setError("Choose remote or on-site support.");
      if (!staffed(mode)) return setError("No verified technician is accepting that visit type in this area.");
    }
    if (step === 4 && next > step && parts !== "" && (!Number.isFinite(partsEstimate) || partsEstimate < 0)) {
      return setError("Enter a parts allowance of zero or more.");
    }
    if (step === 5 && next > step && !window) return setError("Choose an open window.");
    if (step === 6 && next > step) {
      if (mode === "onsite") {
        if (line1.trim().length < 5) return setError("Enter the street address.");
        if (contactName.trim().length < 2) return setError("Enter a contact name.");
        if (phone.replace(/\D/g, "").length !== 10) return setError("Enter a 10-digit mobile number.");
        if (!zone?.postalCodes.includes(postal)) return setError("Use a postal code inside the selected area.");
      } else if (phone.replace(/\D/g, "").length !== 10) return setError("Enter a 10-digit number for the session.");
    }
    setStep(next);
  };

  const confirm = () => {
    if (!agreed || !quote || !zone || (mode !== "remote" && mode !== "onsite")) {
      setError("Confirm that you understand this demo quote.");
      return;
    }
    const result = placeBooking({
      serviceId: service.id,
      zoneId: zone.id,
      postalCode: mode === "onsite" ? postal : state.coverage.postalCode,
      mode,
      deviceType,
      issue,
      answers: service.questions.filter((question) => answers[question.id]).map((question) => ({
        questionId: question.id,
        label: question.prompt,
        value: answers[question.id] ?? "",
      })),
      address:
        mode === "onsite"
          ? { id: addressId === "new" ? freshId("addr") : addressId, label: "Visit", line1, line2, landmark, postalCode: postal, contactName, phone }
          : undefined,
      remoteContact: mode === "remote" ? { phone, channel, notes: remoteNotes } : undefined,
      date: slotDate,
      windowId: slotWindowId,
      partsEstimate,
      discountCode: code,
      priority,
    });
    if (result.ok && result.bookingId) navigate(`/bookings/${result.bookingId}`, { state: { justBooked: true } });
    else setError(result.message);
  };

  const grouped = slots.reduce<Record<string, typeof slots>>((map, slot) => {
    map[slot.date] = [...(map[slot.date] ?? []), slot];
    return map;
  }, {});

  return (
    <div className="container page-block">
      <p className="eyebrow">Booking {service.name}</p>
      <ol className="stepper" aria-label="Booking progress">
        {STEPS.map((label, index) => (
          <li key={label} className={cx(index === step && "current", index < step && "done")} aria-current={index === step ? "step" : undefined}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="wizard-layout">
        <div className="wizard">
          {error ? <p className="banner banner-danger" role="alert">{error}</p> : null}
          {step === 0 ? (
            <section>
              <h1>Confirm the area</h1>
              <p>We only show windows inside a zone that offers this service.</p>
              <PostalChooser />
              {zone && !blocked ? <p className="banner banner-ok">{service.name} can be booked in {zone.name}.</p> : null}
              {zone && blocked ? (
                <>
                  <p className="banner banner-warn">{blocked}</p>
                  <CoverageForm postal={state.coverage.postalCode} serviceId={service.id} />
                </>
              ) : null}
            </section>
          ) : null}
          {step === 1 ? (
            <section>
              <h1>Device and issue</h1>
              <Field id="device" label="Device type">
                <select id="device" value={deviceType} onChange={(event) => setDeviceType(event.target.value)}>
                  {service.deviceTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field id="issue" label="What is going wrong?" hint="A sentence is enough. The technician sees this with the quote.">
                <textarea id="issue" rows={5} value={issue} onChange={(event) => setIssue(event.target.value)} />
              </Field>
            </section>
          ) : null}
          {step === 2 ? (
            <section>
              <h1>A few optional questions</h1>
              <p>Skip anything you are unsure about. Answers do not change the price by themselves.</p>
              {service.questions.map((question) => (
                <fieldset key={question.id}>
                  <legend>{question.prompt}</legend>
                  {question.options.map((option) => (
                    <label key={option} className="choice">
                      <input type="radio" name={question.id} checked={answers[question.id] === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} />
                      {option}
                    </label>
                  ))}
                </fieldset>
              ))}
            </section>
          ) : null}
          {step === 3 ? (
            <section>
              <h1>Remote or on-site</h1>
              <div className="stack">
                {service.modes.map((visit) => {
                  const allowed = modes.includes(visit) && staffed(visit);
                  return (
                    <label key={visit} className={cx("rec", mode === visit && "selected", !allowed && "disabled")}>
                      <input type="radio" name="mode" disabled={!allowed} checked={mode === visit} onChange={() => setMode(visit)} />
                      <span>
                        <strong>{modeLabel(visit)}</strong>
                        <small>{allowed ? "A verified technician can take this in the selected area." : "Not staffed for this area or device."}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ) : null}
          {step === 4 && quote ? (
            <section>
              <h1>Itemized estimate</h1>
              <QuoteView quote={quote} />
              <Field id="parts" label="Parts allowance" hint="Optional. Stays marked as an estimate.">
                <input id="parts" inputMode="numeric" value={parts} onChange={(event) => setParts(event.target.value)} />
              </Field>
              <Field id="code" label="Discount code" hint="Demo code CARE10.">
                <input id="code" value={code} onChange={(event) => setCode(event.target.value)} />
              </Field>
              <label className="choice">
                <input type="checkbox" checked={priority} onChange={(event) => setPriority(event.target.checked)} />
                Request a priority visit ({money(service.urgencySurcharge)} surcharge)
              </label>
              <MockNote>The same calculator runs in the operations price preview.</MockNote>
            </section>
          ) : null}
          {step === 5 ? (
            <section>
              <h1>Choose a window</h1>
              <p>Windows are closed when the zone is shut, the lead time has passed, or every qualified technician is booked.</p>
              {Object.keys(grouped).length === 0 ? <Empty title="No windows" body="Change the visit type or area." /> : null}
              <div className="day-list">
                {Object.entries(grouped).map(([date, daySlots]) => (
                  <section key={date}>
                    <h2>{formatDate(date)}</h2>
                    <div className="slot-grid" role="radiogroup" aria-label={formatDate(date)}>
                      {daySlots.map((slot) => {
                        const key = `${slot.date}|${slot.window.id}`;
                        return (
                          <label key={key} className={cx("slot", slotKey === key && "selected", !slot.decision.ok && "disabled")}>
                            <input type="radio" name="slot" disabled={!slot.decision.ok} checked={slotKey === key} onChange={() => setSlotKey(key)} />
                            <span>
                              <strong>{formatWindow(slot.window)}</strong>
                              <small>{slot.decision.ok ? "Open" : slot.decision.reason}</small>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ) : null}
          {step === 6 ? (
            <section>
              <h1>{mode === "onsite" ? "Visit address" : "Remote session"}</h1>
              {mode === "onsite" ? (
                <>
                  {customer && customer.addresses.length > 0 ? (
                    <Field id="saved-address" label="Saved address">
                      <select
                        id="saved-address"
                        value={addressId}
                        onChange={(event) => {
                          const id = event.target.value;
                          setAddressId(id);
                          const saved = customer.addresses.find((item) => item.id === id);
                          if (!saved) return;
                          setLine1(saved.line1);
                          setLine2(saved.line2);
                          setLandmark(saved.landmark);
                          setPostal(saved.postalCode);
                          setContactName(saved.contactName);
                          setPhone(saved.phone);
                        }}
                      >
                        {customer.addresses.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label} · {item.line1}
                          </option>
                        ))}
                        <option value="new">New address</option>
                      </select>
                    </Field>
                  ) : null}
                  <Field id="line1" label="Street address">
                    <input id="line1" value={line1} onChange={(event) => setLine1(event.target.value)} autoComplete="street-address" />
                  </Field>
                  <Field id="line2" label="Apartment or floor">
                    <input id="line2" value={line2} onChange={(event) => setLine2(event.target.value)} />
                  </Field>
                  <Field id="landmark" label="Landmark">
                    <input id="landmark" value={landmark} onChange={(event) => setLandmark(event.target.value)} />
                  </Field>
                  <Field id="pin" label="Postal code" hint="Must stay inside the selected zone.">
                    <input id="pin" value={postal} onChange={(event) => setPostal(event.target.value)} inputMode="numeric" maxLength={6} />
                  </Field>
                </>
              ) : (
                <>
                  <Field id="channel" label="How should they reach you?">
                    <select id="channel" value={channel} onChange={(event) => setChannel(event.target.value)}>
                      <option>Phone call</option>
                      <option>Video link from the technician</option>
                    </select>
                  </Field>
                  <Field id="remote-notes" label="Anything that helps the session">
                    <textarea id="remote-notes" rows={3} value={remoteNotes} onChange={(event) => setRemoteNotes(event.target.value)} />
                  </Field>
                  <MockNote>No call or video session is started from this demo.</MockNote>
                </>
              )}
              <Field id="contact" label="Contact name">
                <input id="contact" value={contactName} onChange={(event) => setContactName(event.target.value)} autoComplete="name" />
              </Field>
              <Field id="phone" label="Mobile number">
                <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" />
              </Field>
            </section>
          ) : null}
          {step === 7 && quote ? (
            <section>
              <h1>Review</h1>
              <ul className="plain-list">
                <li>{service.name} · {deviceType}</li>
                <li>{zone?.name} · {mode ? modeLabel(mode) : ""}</li>
                <li>{issue}</li>
                <li>{slotDate && window ? `${formatDate(slotDate)} · ${formatWindow(window)}` : "No window"}</li>
              </ul>
              <QuoteView quote={quote} />
              <MockNote>Confirming stores a demo booking in this browser. No card is charged and no message is sent outside the app.</MockNote>
              <label className="choice">
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                I understand this quote, the cancellation cutoff, and that payment is not processed.
              </label>
            </section>
          ) : null}
          <div className="wizard-nav">
            <button className="btn btn-ghost" type="button" disabled={step === 0} onClick={() => go(step - 1)}>
              Back
            </button>
            {step < 7 ? (
              <button className="btn btn-primary" type="button" onClick={() => go(step + 1)}>
                Continue
              </button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={confirm}>
                Confirm booking
              </button>
            )}
          </div>
        </div>
        <aside className="book-panel">
          <h2>Your quote</h2>
          {quote ? <QuoteView quote={quote} /> : <p className="hint">The estimate appears after you choose remote or on-site.</p>}
        </aside>
      </div>
    </div>
  );
}
