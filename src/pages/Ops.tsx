import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AssignPanel, BookingSummary, Empty, Field, MockNote, QuoteView, StatusPill, freshId, useTitle } from "../components/ui";
import { zoneHealth } from "../domain/coverage";
import { emptyOpsFilter, filterBookings, type OpsFilter } from "../domain/filters";
import { cx, dateOffset, formatDate, formatWindow, money, tagLabel, todayISO } from "../domain/format";
import { ADMIN_TRANSITIONS, STATUS_LABEL, isAtRisk, isOpenStatus } from "../domain/lifecycle";
import { calculateQuote } from "../domain/pricing";
import { blockImpact } from "../domain/scheduling";
import { integrationNotes } from "../integrations/mocks";
import { useStore } from "../state/store";
import type { BookingStatus, Category, City, Provider, Service, VisitMode, Zone } from "../types";

export function OverviewPage() {
  useTitle("Operations");
  const { state, resetDemo } = useStore();
  const [filter, setFilter] = useState<OpsFilter>(emptyOpsFilter);
  const now = new Date();
  const rows = filterBookings(state, filter, now);
  const counts = rows.reduce<Record<string, number>>((map, booking) => {
    map[booking.status] = (map[booking.status] ?? 0) + 1;
    return map;
  }, {});
  const today = todayISO(now);
  const todayRows = rows.filter((booking) => booking.date === today);
  const atRisk = rows.filter((booking) => isAtRisk(booking, state.settings, now));
  const value = rows.filter((booking) => booking.status !== "cancelled").reduce((sum, booking) => sum + booking.quote.total, 0);
  const providers = state.providers.filter((provider) => {
    if (filter.providerId && provider.id !== filter.providerId) return false;
    if (filter.zoneId && !provider.zoneIds.includes(filter.zoneId)) return false;
    return provider.status === "active" && provider.verification === "verified" && provider.acceptingWork;
  });
  const capacity = providers.reduce((sum, provider) => {
    if (provider.timeOff.includes(today)) return sum;
    const hours = provider.workingHours.find((item) => item.day === now.getDay());
    if (!hours) return sum;
    return sum + Math.min(provider.maxJobsPerDay, state.settings.windows.length);
  }, 0);
  const assignedToday = state.bookings.filter((booking) => booking.date === today && booking.providerId && booking.status !== "cancelled").length;
  const gaps = state.zones.filter((zone) => zoneHealth(state.providers, zone) !== "ok");
  const days = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const date = dateOffset(offset, now);
    return { date, count: state.bookings.filter((booking) => booking.date === date && booking.status !== "cancelled").length };
  });
  const peak = Math.max(1, ...days.map((day) => day.count));
  return (
    <div className="page-block">
      <div className="split-head">
        <div>
          <h1>Operations</h1>
          <p>Assignment, coverage, and quotes for the sample marketplace.</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={resetDemo}>
          Reset demo data
        </button>
      </div>
      <FilterBar value={filter} onChange={setFilter} />
      <div className="stat-grid">
        {(["confirmed", "assigned", "in_progress", "completed", "cancelled"] as BookingStatus[]).map((status) => (
          <article key={status} className="stat">
            <span>{STATUS_LABEL[status]}</span>
            <strong>{counts[status] ?? 0}</strong>
          </article>
        ))}
        <article className="stat">
          <span>Unassigned in view</span>
          <strong>{rows.filter((booking) => !booking.providerId && isOpenStatus(booking.status)).length}</strong>
        </article>
        <article className="stat">
          <span>Estimated booking value</span>
          <strong>{money(value)}</strong>
        </article>
        <article className="stat">
          <span>Today’s utilization</span>
          <strong>{capacity ? Math.round((assignedToday / capacity) * 100) : 0}%</strong>
          <small>
            {assignedToday} assigned / {capacity} technician windows
          </small>
        </article>
      </div>
      <MockNote>Totals are estimates stored in this browser. {integrationNotes.payments}</MockNote>
      <div className="split">
        <section className="panel">
          <h2>Next seven days</h2>
          <ul className="bars">
            {days.map((day) => (
              <li key={day.date}>
                <span>{formatDate(day.date)}</span>
                <span className="bar-track">
                  <span className="bar" style={{ width: `${(day.count / peak) * 100}%` }} />
                </span>
                <b>{day.count}</b>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>Needs attention</h2>
          {atRisk.length === 0 ? <p>No unassigned visit is inside the {state.settings.assignmentDeadlineHours}-hour deadline.</p> : null}
          <ul className="plain-list">
            {atRisk.map((booking) => (
              <li key={booking.id}>
                <Link to={`/ops/bookings/${booking.id}`}>{booking.ref}</Link> · {formatDate(booking.date)} · {STATUS_LABEL[booking.status]}
              </li>
            ))}
          </ul>
          <h3>Coverage</h3>
          <ul className="plain-list">
            {gaps.map((zone) => (
              <li key={zone.id}>
                {zone.name} is {zoneHealth(state.providers, zone) === "uncovered" ? "without a verified technician" : "thin — only one technician"}.
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section>
        <h2>Today in this view</h2>
        <BookingRows rows={todayRows} />
      </section>
    </div>
  );
}

function FilterBar({ value, onChange }: { value: OpsFilter; onChange: (next: OpsFilter) => void }) {
  const { state } = useStore();
  const set = (patch: Partial<OpsFilter>) => onChange({ ...value, ...patch });
  return (
    <form className="filters filters-wide" aria-label="Filter operations">
      <label>
        When
        <select value={value.when} onChange={(event) => set({ when: event.target.value as OpsFilter["when"] })}>
          <option value="all">All dates</option>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="week">Next 7 days</option>
        </select>
      </label>
      <label>
        City
        <select value={value.cityId} onChange={(event) => set({ cityId: event.target.value, zoneId: "" })}>
          <option value="">All</option>
          {state.cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Area
        <select value={value.zoneId} onChange={(event) => set({ zoneId: event.target.value })}>
          <option value="">All</option>
          {state.zones
            .filter((zone) => !value.cityId || zone.cityId === value.cityId)
            .map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Category
        <select value={value.categoryId} onChange={(event) => set({ categoryId: event.target.value })}>
          <option value="">All</option>
          {state.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Technician
        <select value={value.providerId} onChange={(event) => set({ providerId: event.target.value })}>
          <option value="">All</option>
          {state.providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select value={value.status} onChange={(event) => set({ status: event.target.value })}>
          <option value="">All</option>
          {Object.entries(STATUS_LABEL).map(([status, label]) => (
            <option key={status} value={status}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

function BookingRows({ rows }: { rows: { id: string; ref: string; serviceId: string; date: string; windowId: string; status: BookingStatus; providerId?: string; quote: { total: number } }[] }) {
  const { state } = useStore();
  if (rows.length === 0) return <Empty title="Nothing in this view" body="Adjust the filters or wait for a new booking." />;
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Bookings</caption>
        <thead>
          <tr>
            <th>Ref</th>
            <th>Service</th>
            <th>When</th>
            <th>Technician</th>
            <th>Status</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((booking) => {
            const service = state.services.find((item) => item.id === booking.serviceId);
            const window = state.settings.windows.find((item) => item.id === booking.windowId);
            const provider = state.providers.find((item) => item.id === booking.providerId);
            return (
              <tr key={booking.id}>
                <td>
                  <Link to={`/ops/bookings/${booking.id}`}>{booking.ref}</Link>
                </td>
                <td>{service?.name}</td>
                <td>
                  {formatDate(booking.date)} {window ? `· ${formatWindow(window)}` : ""}
                </td>
                <td>{provider?.name ?? "Unassigned"}</td>
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

export function AreasPage() {
  useTitle("Service areas");
  const { state, saveZone, saveCity, deleteZone, reviewCoverageRequest } = useStore();
  const blank = (): Zone => ({
    id: freshId("zone"),
    cityId: state.cities[0]?.id ?? "",
    name: "",
    postalCodes: [],
    travelRadiusKm: 8,
    travelFee: 99,
    open: "09:00",
    close: "18:00",
    leadTimeHours: 3,
    enabledServiceIds: state.services.map((service) => service.id),
    enabledModes: ["onsite", "remote"],
    enabledTags: ["field", "remote_desk"],
  });
  const [draft, setDraft] = useState<Zone | null>(null);
  const [pins, setPins] = useState("");
  const [cityName, setCityName] = useState("");
  const [region, setRegion] = useState("");
  const grouped = state.cities.map((city) => ({ city, zones: state.zones.filter((zone) => zone.cityId === city.id) }));
  return (
    <div className="page-block">
      <div className="split-head">
        <div>
          <h1>Service areas</h1>
          <p>Postal codes decide coverage. This is not a live map.</p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            const zone = blank();
            setDraft(zone);
            setPins("");
          }}
        >
          New zone
        </button>
      </div>
      <MockNote>{integrationNotes.maps}</MockNote>
      {grouped.map(({ city, zones }) => (
        <section key={city.id}>
          <h2>
            {city.name} <span className="fine">{city.region}</span>
          </h2>
          <div className="zone-board">
            {zones.map((zone) => {
              const health = zoneHealth(state.providers, zone);
              return (
                <button
                  key={zone.id}
                  type="button"
                  className={cx("zone-tile", `health-${health}`)}
                  onClick={() => {
                    setDraft(zone);
                    setPins(zone.postalCodes.join(", "));
                  }}
                >
                  <strong>{zone.name}</strong>
                  <span>{health === "ok" ? "Covered" : health === "thin" ? "Thin coverage" : "No technician"}</span>
                  <small>{zone.postalCodes.join(" · ")}</small>
                  <small>
                    {zone.open}–{zone.close} · travel {money(zone.travelFee)} · {zone.leadTimeHours}h notice
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <div className="legend">
        <span className="health-ok">Covered</span>
        <span className="health-thin">One technician</span>
        <span className="health-bad">No accepting technician</span>
      </div>
      {draft ? (
        <form
          className="panel stack"
          onSubmit={(event) => {
            event.preventDefault();
            saveZone({ ...draft, postalCodes: pins.split(/[\s,]+/).filter(Boolean) });
          }}
        >
          <h2>{state.zones.some((zone) => zone.id === draft.id) ? `Edit ${draft.name}` : "New zone"}</h2>
          <Field id="zone-city" label="City">
            <select id="zone-city" value={draft.cityId} onChange={(event) => setDraft({ ...draft, cityId: event.target.value })}>
              {state.cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="zone-name" label="Zone name">
            <input id="zone-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field id="zone-pins" label="Postal codes" hint="Separate with commas.">
            <input id="zone-pins" value={pins} onChange={(event) => setPins(event.target.value)} />
          </Field>
          <div className="form-grid">
            <Field id="radius" label="Travel radius (km)">
              <input id="radius" type="number" min={1} value={draft.travelRadiusKm} onChange={(event) => setDraft({ ...draft, travelRadiusKm: Number(event.target.value) })} />
            </Field>
            <Field id="fee" label="Travel fee">
              <input id="fee" type="number" min={0} value={draft.travelFee} onChange={(event) => setDraft({ ...draft, travelFee: Number(event.target.value) })} />
            </Field>
            <Field id="open" label="Opens">
              <input id="open" type="time" value={draft.open} onChange={(event) => setDraft({ ...draft, open: event.target.value })} />
            </Field>
            <Field id="close" label="Closes">
              <input id="close" type="time" value={draft.close} onChange={(event) => setDraft({ ...draft, close: event.target.value })} />
            </Field>
            <Field id="lead" label="Lead time (hours)">
              <input id="lead" type="number" min={0} value={draft.leadTimeHours} onChange={(event) => setDraft({ ...draft, leadTimeHours: Number(event.target.value) })} />
            </Field>
          </div>
          <fieldset>
            <legend>Services</legend>
            <div className="check-grid">
              {state.services.map((service) => (
                <label key={service.id}>
                  <input
                    type="checkbox"
                    checked={draft.enabledServiceIds.includes(service.id)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        enabledServiceIds: event.target.checked
                          ? [...draft.enabledServiceIds, service.id]
                          : draft.enabledServiceIds.filter((id) => id !== service.id),
                      })
                    }
                  />
                  {service.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Visit types and technician types</legend>
            <div className="check-grid">
              {(["onsite", "remote"] as VisitMode[]).map((mode) => (
                <label key={mode}>
                  <input
                    type="checkbox"
                    checked={draft.enabledModes.includes(mode)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        enabledModes: event.target.checked ? [...draft.enabledModes, mode] : draft.enabledModes.filter((item) => item !== mode),
                      })
                    }
                  />
                  {mode === "onsite" ? "On-site" : "Remote"}
                </label>
              ))}
              {(["field", "remote_desk", "business"] as const).map((tag) => (
                <label key={tag}>
                  <input
                    type="checkbox"
                    checked={draft.enabledTags.includes(tag)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        enabledTags: event.target.checked ? [...draft.enabledTags, tag] : draft.enabledTags.filter((item) => item !== tag),
                      })
                    }
                  />
                  {tagLabel(tag)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="row-actions">
            <button className="btn btn-primary" type="submit">
              Save zone
            </button>
            {state.zones.some((zone) => zone.id === draft.id) ? (
              <button className="btn btn-danger" type="button" onClick={() => deleteZone(draft.id)}>
                Delete zone
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
      <form
        className="panel form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          const city: City = { id: freshId("city"), name: cityName, region };
          const result = saveCity(city);
          if (result.ok) {
            setCityName("");
            setRegion("");
          }
        }}
      >
        <h2>Add a city</h2>
        <Field id="city-name" label="City">
          <input id="city-name" value={cityName} onChange={(event) => setCityName(event.target.value)} />
        </Field>
        <Field id="region" label="Region">
          <input id="region" value={region} onChange={(event) => setRegion(event.target.value)} />
        </Field>
        <button className="btn btn-secondary" type="submit">
          Save city
        </button>
      </form>
      <section>
        <h2>Coverage requests</h2>
        {state.coverageRequests.length === 0 ? <Empty title="No requests" body="Customers can ask when a pin code is outside the zones." /> : null}
        <ul className="plain-list">
          {state.coverageRequests.map((request) => (
            <li key={request.id}>
              <strong>{request.postalCode}</strong> · {request.name} · {request.phone} · {request.status}
              <p>{request.note}</p>
              {request.status === "new" ? (
                <button className="btn btn-small btn-secondary" type="button" onClick={() => reviewCoverageRequest(request.id)}>
                  Mark reviewed
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function CatalogPage() {
  useTitle("Catalog");
  const { state, saveService, saveCategory, saveAreaPrice } = useStore();
  const [serviceId, setServiceId] = useState(state.services[0]?.id ?? "");
  const current = state.services.find((item) => item.id === serviceId) ?? state.services[0];
  const [draft, setDraft] = useState<Service | null>(current ?? null);
  const [zoneId, setZoneId] = useState(state.zones[0]?.id ?? "");
  const [mode, setMode] = useState<VisitMode>("onsite");
  const [priority, setPriority] = useState(false);
  const [parts, setParts] = useState(0);
  const [soon, setSoon] = useState(false);
  const zone = state.zones.find((item) => item.id === zoneId) ?? null;
  const override = state.areaPrices.find((price) => price.zoneId === zoneId && price.serviceId === draft?.id);
  const [baseOverride, setBaseOverride] = useState(override?.basePrice?.toString() ?? "");
  const [travelOverride, setTravelOverride] = useState(override?.travelFee?.toString() ?? "");
  const preview = useMemo(() => {
    if (!draft) return null;
    return calculateQuote({
      service: draft,
      zone,
      areaPrices: [
        ...state.areaPrices.filter((price) => !(price.zoneId === zoneId && price.serviceId === draft.id)),
        ...(baseOverride || travelOverride
          ? [{ zoneId, serviceId: draft.id, basePrice: baseOverride ? Number(baseOverride) : undefined, travelFee: travelOverride ? Number(travelOverride) : undefined }]
          : []),
      ],
      mode,
      partsEstimate: parts,
      discountCode: "",
      priority,
      slotStartsAt: soon ? new Date(Date.now() + 60 * 60 * 1000) : null,
      now: new Date(),
      urgencyWithinHours: state.settings.urgencyWithinHours,
    });
  }, [draft, zone, state.areaPrices, state.settings.urgencyWithinHours, zoneId, baseOverride, travelOverride, mode, parts, priority, soon]);
  if (!draft) return <Empty title="No services" body="Add a service to the catalog." />;
  return (
    <div className="page-block">
      <h1>Catalog and costing</h1>
      <p>Preview uses the same quote function customers see, including unsaved edits.</p>
      <div className="detail-grid">
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            const result = saveService(draft);
            if (result.ok) setServiceId(draft.id);
          }}
        >
          <Field id="pick-service" label="Service">
            <select
              id="pick-service"
              value={draft.id}
              onChange={(event) => {
                const next = state.services.find((item) => item.id === event.target.value);
                if (next) {
                  setServiceId(next.id);
                  setDraft(next);
                }
              }}
            >
              {state.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                id: freshId("svc"),
                name: "New service",
                priceType: "fixed",
                basePrice: 799,
                diagnosticFee: 0,
                laborRatePerHour: 0,
              })
            }
          >
            New service
          </button>
          <Field id="svc-name" label="Name">
            <input id="svc-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field id="svc-summary" label="Short description">
            <textarea id="svc-summary" rows={3} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
          </Field>
          <Field id="svc-cat" label="Category">
            <select id="svc-cat" value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
              {state.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="devices" label="Device types" hint="Comma separated.">
            <input id="devices" value={draft.deviceTypes.join(", ")} onChange={(event) => setDraft({ ...draft, deviceTypes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
          </Field>
          <Field id="duration" label="Expected duration (minutes)">
            <input id="duration" type="number" min={15} value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })} />
          </Field>
          <Field id="price-type" label="Price type">
            <select id="price-type" value={draft.priceType} onChange={(event) => setDraft({ ...draft, priceType: event.target.value as Service["priceType"] })}>
              <option value="fixed">Fixed</option>
              <option value="estimate">Diagnosis required</option>
            </select>
          </Field>
          <div className="form-grid">
            <Num label="Base price" value={draft.basePrice} onChange={(basePrice) => setDraft({ ...draft, basePrice })} />
            <Num label="Diagnostic fee" value={draft.diagnosticFee} onChange={(diagnosticFee) => setDraft({ ...draft, diagnosticFee })} />
            <Num label="Labor rate / hour" value={draft.laborRatePerHour} onChange={(laborRatePerHour) => setDraft({ ...draft, laborRatePerHour })} />
            <Num label="Priority surcharge" value={draft.urgencySurcharge} onChange={(urgencySurcharge) => setDraft({ ...draft, urgencySurcharge })} />
            <Num label="GST rate" value={draft.taxRate} step={0.01} onChange={(taxRate) => setDraft({ ...draft, taxRate })} />
            <Num label="Commission rate" value={draft.commissionRate} step={0.01} onChange={(commissionRate) => setDraft({ ...draft, commissionRate })} />
          </div>
          <p className="hint">For diagnosis-required work, put expected labor in the hourly rate. A fixed service should keep labor at zero so it is not charged twice.</p>
          <fieldset>
            <legend>Visit modes</legend>
            {(["onsite", "remote"] as VisitMode[]).map((item) => (
              <label key={item} className="choice">
                <input
                  type="checkbox"
                  checked={draft.modes.includes(item)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      modes: event.target.checked ? [...draft.modes, item] : draft.modes.filter((modeItem) => modeItem !== item),
                    })
                  }
                />
                {item === "onsite" ? "On-site" : "Remote"}
              </label>
            ))}
          </fieldset>
          <Field id="tag" label="Required technician type">
            <select
              id="tag"
              value={draft.requiredTag ?? ""}
              onChange={(event) => setDraft({ ...draft, requiredTag: (event.target.value || undefined) as Service["requiredTag"] })}
            >
              <option value="">Any verified technician with the skill</option>
              <option value="field">On-site technician</option>
              <option value="remote_desk">Remote specialist</option>
              <option value="business">Business IT</option>
            </select>
          </Field>
          <button className="btn btn-primary" type="submit">
            Save service
          </button>
          <h2>Area price</h2>
          <Field id="price-zone" label="Zone">
            <select
              id="price-zone"
              value={zoneId}
              onChange={(event) => {
                const id = event.target.value;
                setZoneId(id);
                const next = state.areaPrices.find((price) => price.zoneId === id && price.serviceId === draft.id);
                setBaseOverride(next?.basePrice?.toString() ?? "");
                setTravelOverride(next?.travelFee?.toString() ?? "");
              }}
            >
              {state.zones.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="base-override" label="Override base price" hint="Leave blank to use the catalog base.">
            <input id="base-override" value={baseOverride} onChange={(event) => setBaseOverride(event.target.value)} />
          </Field>
          <Field id="travel-override" label="Override travel fee">
            <input id="travel-override" value={travelOverride} onChange={(event) => setTravelOverride(event.target.value)} />
          </Field>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() =>
              saveAreaPrice({
                zoneId,
                serviceId: draft.id,
                basePrice: baseOverride ? Number(baseOverride) : undefined,
                travelFee: travelOverride ? Number(travelOverride) : undefined,
              })
            }
          >
            Save area price
          </button>
        </form>
        <aside className="book-panel">
          <h2>Price preview</h2>
          <label className="choice">
            Visit
            <select value={mode} onChange={(event) => setMode(event.target.value as VisitMode)}>
              <option value="onsite">On-site</option>
              <option value="remote">Remote</option>
            </select>
          </label>
          <Num label="Parts allowance" value={parts} onChange={setParts} />
          <label className="choice">
            <input type="checkbox" checked={priority} onChange={(event) => setPriority(event.target.checked)} /> Priority surcharge
          </label>
          <label className="choice">
            <input type="checkbox" checked={soon} onChange={(event) => setSoon(event.target.checked)} /> Window starts within the short-notice period
          </label>
          {preview ? <QuoteView quote={preview} audience="ops" /> : null}
        </aside>
      </div>
      <CategoryEditor
        onSave={(category) => {
          saveCategory(category);
        }}
      />
    </div>
  );
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <Field id={id} label={label}>
      <input id={id} type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </Field>
  );
}

function CategoryEditor({ onSave }: { onSave: (category: Category) => void }) {
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  return (
    <form
      className="panel stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ id: freshId("cat"), name, blurb });
        setName("");
        setBlurb("");
      }}
    >
      <h2>New category</h2>
      <Field id="cat-name" label="Name">
        <input id="cat-name" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field id="cat-blurb" label="Description">
        <input id="cat-blurb" value={blurb} onChange={(event) => setBlurb(event.target.value)} />
      </Field>
      <button className="btn btn-secondary" type="submit">
        Add category
      </button>
    </form>
  );
}

export function DispatchPage() {
  useTitle("Dispatch");
  const { state } = useStore();
  const queue = state.bookings
    .filter((booking) => ["confirmed", "provider_unavailable", "reschedule_requested"].includes(booking.status) && !booking.providerId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const [selected, setSelected] = useState(queue[0]?.id ?? "");
  const booking = state.bookings.find((item) => item.id === selected) ?? queue[0];
  return (
    <div className="page-block">
      <h1>Dispatch</h1>
      <p>Recommendations consider skill, device, area, visit type, hours, time off, rating, and jobs already in the window.</p>
      <div className="detail-grid">
        <div className="stack">
          {queue.length === 0 ? <Empty title="Dispatch queue is clear" body="New confirmed bookings land here until a technician is assigned." /> : null}
          {queue.map((item) => {
            const service = state.services.find((serviceItem) => serviceItem.id === item.serviceId);
            const zone = state.zones.find((zoneItem) => zoneItem.id === item.zoneId);
            const risk = isAtRisk(item, state.settings, new Date());
            return (
              <button key={item.id} type="button" className={cx("panel rec", booking?.id === item.id && "selected")} onClick={() => setSelected(item.id)}>
                <strong>
                  {item.ref} · {service?.name}
                </strong>
                <small>
                  {zone?.name} · {formatDate(item.date)} · {STATUS_LABEL[item.status]}
                  {risk ? " · At risk" : ""}
                </small>
              </button>
            );
          })}
        </div>
        <div className="panel">{booking ? <AssignPanel booking={booking} /> : <p>Select a job.</p>}</div>
      </div>
    </div>
  );
}

export function CapacityPage() {
  useTitle("Capacity");
  const { state, saveSettings, blockSlot, reopenSlot } = useStore();
  const [settings, setSettings] = useState(state.settings);
  const [zoneId, setZoneId] = useState(state.zones[0]?.id ?? "");
  const [note, setNote] = useState("");
  const days = [0, 1, 2, 3, 4, 5, 6].map((offset) => dateOffset(offset));
  return (
    <div className="page-block">
      <h1>Time and capacity</h1>
      <p>Each technician can hold one job per window, up to their daily cap. Closing a window stops new bookings only.</p>
      <form
        className="panel stack"
        onSubmit={(event) => {
          event.preventDefault();
          saveSettings(settings);
        }}
      >
        <div className="form-grid">
          <Num label="Cancel cutoff hours" value={settings.cancellationCutoffHours} onChange={(cancellationCutoffHours) => setSettings({ ...settings, cancellationCutoffHours })} />
          <Num label="Reschedule cutoff hours" value={settings.rescheduleCutoffHours} onChange={(rescheduleCutoffHours) => setSettings({ ...settings, rescheduleCutoffHours })} />
          <Num label="Short-notice hours" value={settings.urgencyWithinHours} onChange={(urgencyWithinHours) => setSettings({ ...settings, urgencyWithinHours })} />
          <Num label="Assignment deadline hours" value={settings.assignmentDeadlineHours} onChange={(assignmentDeadlineHours) => setSettings({ ...settings, assignmentDeadlineHours })} />
          <Num label="Travel buffer minutes" value={settings.travelBufferMinutes} onChange={(travelBufferMinutes) => setSettings({ ...settings, travelBufferMinutes })} />
        </div>
        <h2>Windows</h2>
        {settings.windows.map((window, index) => (
          <div key={window.id} className="form-grid">
            <Field id={`w-label-${window.id}`} label="Label">
              <input
                id={`w-label-${window.id}`}
                value={window.label}
                onChange={(event) => {
                  const windows = settings.windows.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item));
                  setSettings({ ...settings, windows });
                }}
              />
            </Field>
            <Field id={`w-start-${window.id}`} label="Start">
              <input
                id={`w-start-${window.id}`}
                type="time"
                value={window.start}
                onChange={(event) => {
                  const windows = settings.windows.map((item, itemIndex) => (itemIndex === index ? { ...item, start: event.target.value } : item));
                  setSettings({ ...settings, windows });
                }}
              />
            </Field>
            <Field id={`w-end-${window.id}`} label="End">
              <input
                id={`w-end-${window.id}`}
                type="time"
                value={window.end}
                onChange={(event) => {
                  const windows = settings.windows.map((item, itemIndex) => (itemIndex === index ? { ...item, end: event.target.value } : item));
                  setSettings({ ...settings, windows });
                }}
              />
            </Field>
          </div>
        ))}
        <button className="btn btn-primary" type="submit">
          Save schedule rules
        </button>
      </form>
      <Field id="cap-zone" label="Zone">
        <select id="cap-zone" value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
          {state.zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </Field>
      {note ? <p className="banner banner-info">{note}</p> : null}
      <div className="table-wrap">
        <table>
          <caption>Capacity for the selected zone</caption>
          <thead>
            <tr>
              <th>Day</th>
              {state.settings.windows.map((window) => (
                <th key={window.id}>{window.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((date) => (
              <tr key={date}>
                <th scope="row">{formatDate(date)}</th>
                {state.settings.windows.map((window) => {
                  const blocked = state.blocks.some((block) => block.zoneId === zoneId && block.date === date && block.windowId === window.id);
                  const booked = state.bookings.filter((booking) => booking.zoneId === zoneId && booking.date === date && booking.windowId === window.id && isOpenStatus(booking.status)).length;
                  return (
                    <td key={window.id}>
                      <p>{blocked ? "Closed" : `${booked} booked`}</p>
                      <button
                        className="btn btn-small btn-ghost"
                        type="button"
                        onClick={() => {
                          setNote(blockImpact(state, zoneId, date, window.id));
                          if (blocked) reopenSlot(zoneId, date, window.id);
                          else blockSlot(zoneId, date, window.id);
                        }}
                      >
                        {blocked ? "Reopen" : "Close"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OpsBookingsPage() {
  useTitle("Bookings");
  const { state } = useStore();
  const [filter, setFilter] = useState<OpsFilter>(emptyOpsFilter);
  const rows = filterBookings(state, filter);
  return (
    <div className="page-block">
      <h1>Bookings</h1>
      <FilterBar value={filter} onChange={setFilter} />
      <BookingRows rows={rows} />
    </div>
  );
}

export function OpsBookingPage() {
  const { bookingId } = useParams();
  const { state, setBookingStatus, setInternalNote, cancelBooking } = useStore();
  const booking = state.bookings.find((item) => item.id === bookingId);
  useTitle(booking?.ref ?? "Booking");
  const [note, setNote] = useState(booking?.internalNote ?? "");
  const [reason, setReason] = useState("");
  if (!booking) return <Empty title="Booking not found" body="It may have been cleared with the demo reset." />;
  return (
    <div className="page-block detail-grid">
      <BookingSummary booking={booking} audience="ops" />
      <div className="stack">
        <AssignPanel booking={booking} />
        <Field id="status" label="Move status">
          <select
            id="status"
            value=""
            onChange={(event) => {
              const status = event.target.value as BookingStatus;
              if (status) setBookingStatus(booking.id, status);
            }}
          >
            <option value="">Choose a legal next status</option>
            {ADMIN_TRANSITIONS[booking.status].map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="note" label="Internal note">
          <textarea id="note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <button className="btn btn-secondary" type="button" onClick={() => setInternalNote(booking.id, note)}>
          Save note
        </button>
        <Field id="ops-cancel" label="Cancellation reason">
          <input id="ops-cancel" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <button className="btn btn-danger" type="button" onClick={() => cancelBooking(booking.id, reason || "Cancelled by operations")}>
          Cancel booking
        </button>
        <MockNote>{integrationNotes.notifications}</MockNote>
      </div>
    </div>
  );
}

export function ProvidersPage() {
  useTitle("Technicians");
  const { state, saveProvider } = useStore();
  const [id, setId] = useState(state.providers[0]?.id ?? "");
  const current = state.providers.find((provider) => provider.id === id) ?? state.providers[0];
  const [draft, setDraft] = useState<Provider | null>(current ?? null);
  if (!draft) return <Empty title="No technicians" body="Add a technician to start dispatch." />;
  const jobs = state.bookings.filter((booking) => booking.providerId === draft.id);
  return (
    <div className="page-block detail-grid">
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const result = saveProvider(draft);
          if (result.ok) setId(draft.id);
        }}
      >
        <Field id="pick-pro" label="Technician">
          <select
            id="pick-pro"
            value={draft.id}
            onChange={(event) => {
              const next = state.providers.find((provider) => provider.id === event.target.value);
              if (next) {
                setId(next.id);
                setDraft(next);
              }
            }}
          >
            {state.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() =>
            setDraft({
              ...draft,
              id: freshId("pro"),
              name: "New technician",
              headline: "Add skills and zones",
              skills: [],
              status: "active",
              verification: "pending",
              acceptingWork: false,
              rating: 0,
            })
          }
        >
          New technician
        </button>
        <p className="hint">New people appear in dispatch. Demo sign-in exists only for accounts on the login page.</p>
        <Field id="pro-name" label="Name">
          <input id="pro-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </Field>
        <Field id="pro-head" label="Headline">
          <input id="pro-head" value={draft.headline} onChange={(event) => setDraft({ ...draft, headline: event.target.value })} />
        </Field>
        <div className="form-grid">
          <Field id="pro-status" label="Operational status">
            <select id="pro-status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Provider["status"] })}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="suspended">Suspended</option>
            </select>
          </Field>
          <Field id="pro-ver" label="Verification">
            <select id="pro-ver" value={draft.verification} onChange={(event) => setDraft({ ...draft, verification: event.target.value as Provider["verification"] })}>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
          <Num label="Max jobs / day" value={draft.maxJobsPerDay} onChange={(maxJobsPerDay) => setDraft({ ...draft, maxJobsPerDay })} />
        </div>
        <label className="choice">
          <input type="checkbox" checked={draft.acceptingWork} onChange={(event) => setDraft({ ...draft, acceptingWork: event.target.checked })} />
          Accepting new jobs
        </label>
        <fieldset>
          <legend>Skills</legend>
          <div className="check-grid">
            {state.services.map((service) => (
              <label key={service.id}>
                <input
                  type="checkbox"
                  checked={draft.skills.includes(service.id)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      skills: event.target.checked ? [...draft.skills, service.id] : draft.skills.filter((item) => item !== service.id),
                    })
                  }
                />
                {service.name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Zones</legend>
          <div className="check-grid">
            {state.zones.map((zone) => (
              <label key={zone.id}>
                <input
                  type="checkbox"
                  checked={draft.zoneIds.includes(zone.id)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      zoneIds: event.target.checked ? [...draft.zoneIds, zone.id] : draft.zoneIds.filter((item) => item !== zone.id),
                    })
                  }
                />
                {zone.name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Modes and types</legend>
          <div className="check-grid">
            {(["onsite", "remote"] as VisitMode[]).map((mode) => (
              <label key={mode}>
                <input
                  type="checkbox"
                  checked={draft.modes.includes(mode)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      modes: event.target.checked ? [...draft.modes, mode] : draft.modes.filter((item) => item !== mode),
                    })
                  }
                />
                {mode}
              </label>
            ))}
            {(["field", "remote_desk", "business"] as const).map((tag) => (
              <label key={tag}>
                <input
                  type="checkbox"
                  checked={draft.tags.includes(tag)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      tags: event.target.checked ? [...draft.tags, tag] : draft.tags.filter((item) => item !== tag),
                    })
                  }
                />
                {tagLabel(tag)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="devices-pro" label="Devices" hint="Comma separated. Leave blank to accept every device.">
          <input id="devices-pro" value={draft.deviceTypes.join(", ")} onChange={(event) => setDraft({ ...draft, deviceTypes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
        </Field>
        <button className="btn btn-primary" type="submit">
          Save technician
        </button>
      </form>
      <aside className="panel">
        <h2>Workload</h2>
        <p>
          Rating {draft.rating.toFixed(1)} · {jobs.filter((job) => job.status === "completed").length} completed · {jobs.filter((job) => job.status === "cancelled").length} cancelled
        </p>
        <ul className="plain-list">
          {jobs
            .filter((job) => isOpenStatus(job.status))
            .map((job) => (
              <li key={job.id}>
                <Link to={`/ops/bookings/${job.id}`}>{job.ref}</Link> · {formatDate(job.date)} · {STATUS_LABEL[job.status]}
              </li>
            ))}
        </ul>
        {draft.timeOff.length ? <p>Time off: {draft.timeOff.map((date) => formatDate(date)).join(", ")}</p> : <p>No time off recorded.</p>}
      </aside>
    </div>
  );
}
