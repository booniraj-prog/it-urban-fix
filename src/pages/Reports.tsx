import { useMemo, useState } from "react";
import { Empty, MockNote, StatusPill, useTitle } from "../components/ui";
import { formatDate, formatWindow, money, todayISO, dateOffset } from "../domain/format";
import { STATUS_LABEL } from "../domain/lifecycle";
import { integrationNotes } from "../integrations/mocks";
import { useStore } from "../state/store";
import type { BookingStatus } from "../types";

export function ReportsPage() {
  useTitle("Reports");
  const { state } = useStore();
  const [from, setFrom] = useState(dateOffset(-2));
  const [to, setTo] = useState(dateOffset(7));
  const [cityId, setCityId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [status, setStatus] = useState("");

  const rows = useMemo(() => {
    return state.bookings.filter((booking) => {
      if (from && booking.date < from) return false;
      if (to && booking.date > to) return false;
      if (status && booking.status !== status) return false;
      if (zoneId && booking.zoneId !== zoneId) return false;
      if (providerId && booking.providerId !== providerId) return false;
      if (cityId) {
        const zone = state.zones.find((item) => item.id === booking.zoneId);
        if (!zone || zone.cityId !== cityId) return false;
      }
      if (categoryId) {
        const service = state.services.find((item) => item.id === booking.serviceId);
        if (!service || service.categoryId !== categoryId) return false;
      }
      return true;
    });
  }, [state, from, to, cityId, zoneId, categoryId, providerId, status]);

  const active = rows.filter((booking) => booking.status !== "cancelled");
  const value = active.reduce((sum, booking) => sum + booking.quote.total, 0);
  const completed = rows.filter((booking) => booking.status === "completed").length;
  const cancelled = rows.filter((booking) => booking.status === "cancelled").length;
  const unassigned = rows.filter((booking) => !booking.providerId && booking.status !== "cancelled" && booking.status !== "completed").length;
  const byCategory = state.categories
    .map((category) => {
      const count = rows.filter((booking) => state.services.find((service) => service.id === booking.serviceId)?.categoryId === category.id).length;
      return { name: category.name, count };
    })
    .filter((item) => item.count > 0);
  const peak = Math.max(1, ...byCategory.map((item) => item.count));

  const exportCsv = () => {
    const header = ["Reference", "Date", "Window", "Service", "Area", "Status", "Technician", "Estimated total INR", "Estimate"];
    const body = rows.map((booking) => {
      const service = state.services.find((item) => item.id === booking.serviceId);
      const zone = state.zones.find((item) => item.id === booking.zoneId);
      const window = state.settings.windows.find((item) => item.id === booking.windowId);
      const provider = state.providers.find((item) => item.id === booking.providerId);
      return [
        booking.ref,
        booking.date,
        window ? formatWindow(window) : booking.windowId,
        service?.name ?? "",
        zone?.name ?? "",
        STATUS_LABEL[booking.status],
        provider?.name ?? "Unassigned",
        String(booking.quote.total),
        booking.quote.hasEstimate ? "Estimate" : "Fixed",
      ];
    });
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `techcare-sample-report-${todayISO()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-block">
      <h1>Reports</h1>
      <p>Estimated booking value for the sample marketplace. Amounts are quotes, not collected payments.</p>
      <MockNote>
        {integrationNotes.storage} {integrationNotes.payments}
      </MockNote>
      <form className="filters filters-wide" aria-label="Filter the report">
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label>
          City
          <select value={cityId} onChange={(event) => { setCityId(event.target.value); setZoneId(""); }}>
            <option value="">All</option>
            {state.cities.map((city) => (
              <option key={city.id} value={city.id}>{city.name}</option>
            ))}
          </select>
        </label>
        <label>
          Area
          <select value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
            <option value="">All</option>
            {state.zones.filter((zone) => !cityId || zone.cityId === cityId).map((zone) => (
              <option key={zone.id} value={zone.id}>{zone.name}</option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All</option>
            {state.categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          Technician
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">All</option>
            {state.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All</option>
            {(Object.keys(STATUS_LABEL) as BookingStatus[]).map((key) => (
              <option key={key} value={key}>{STATUS_LABEL[key]}</option>
            ))}
          </select>
        </label>
      </form>
      <div className="stat-grid">
        <article className="stat"><span>Bookings</span><strong>{rows.length}</strong></article>
        <article className="stat"><span>Estimated value</span><strong>{money(value)}</strong></article>
        <article className="stat"><span>Completed</span><strong>{completed}</strong></article>
        <article className="stat"><span>Cancelled</span><strong>{cancelled}</strong></article>
        <article className={unassigned ? "stat stat-alert" : "stat"}><span>Unassigned</span><strong>{unassigned}</strong></article>
      </div>
      <section className="panel">
        <h2>Bookings by category</h2>
        {byCategory.length === 0 ? <Empty title="Nothing in this range" body="Widen the dates or clear a filter. The chart stays empty until a booking matches." /> : null}
        <div>
          {byCategory.map((item) => (
            <div key={item.name} className="chart-row">
              <span>{item.name}</span>
              <span className="bar-track" aria-hidden="true">
                <span className="bar" style={{ width: `${(item.count / peak) * 100}%` }} />
              </span>
              <b>{item.count} {item.count === 1 ? "booking" : "bookings"}</b>
            </div>
          ))}
        </div>
      </section>
      <div className="split-head">
        <h2>Matching bookings</h2>
        <button className="btn btn-secondary" type="button" onClick={exportCsv} disabled={rows.length === 0}>
          Export sample CSV
        </button>
      </div>
      {rows.length === 0 ? <Empty title="No rows to export" body="Change the filters to include at least one sample booking." /> : <ReportTable rows={rows} />}
    </div>
  );
}

function ReportTable({ rows }: { rows: { id: string; ref: string; serviceId: string; zoneId: string; date: string; windowId: string; status: BookingStatus; providerId?: string; quote: { total: number; hasEstimate: boolean } }[] }) {
  const { state } = useStore();
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Sample booking report</caption>
        <thead>
          <tr>
            <th>Ref</th>
            <th>When</th>
            <th>Service</th>
            <th>Area</th>
            <th>Status</th>
            <th>Technician</th>
            <th>Quote</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((booking) => {
            const service = state.services.find((item) => item.id === booking.serviceId);
            const zone = state.zones.find((item) => item.id === booking.zoneId);
            const window = state.settings.windows.find((item) => item.id === booking.windowId);
            const provider = state.providers.find((item) => item.id === booking.providerId);
            return (
              <tr key={booking.id}>
                <td>{booking.ref}</td>
                <td>{formatDate(booking.date)}{window ? ` · ${formatWindow(window)}` : ""}</td>
                <td>{service?.name}</td>
                <td>{zone?.name}</td>
                <td><StatusPill status={booking.status} /></td>
                <td>{provider?.name ?? "Unassigned"}</td>
                <td>{money(booking.quote.total)} · {booking.quote.hasEstimate ? "Estimate" : "Fixed"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
