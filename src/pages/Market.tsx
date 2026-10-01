import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { brand } from "../brand";
import { CategoryMark, Icon } from "../components/Icons";
import { CoverageForm, Empty, MockNote, PostalChooser, ServiceCard, Stars, useTitle } from "../components/ui";
import { coverageMessage, zoneHealth } from "../domain/coverage";
import { formatWindow, money } from "../domain/format";
import { previewCardQuote } from "../domain/pricing";
import { listSlots, nextOpenSlot } from "../domain/scheduling";
import { useStore } from "../state/store";
import { homeFor } from "../components/Shells";

export function LandingPage() {
  useTitle("Home");
  const { state } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const popular = [...state.services].sort((a, b) => b.rating - a.rating).slice(0, 4);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Neighborhood IT, with the price written down</p>
          <h1>Book a technician who can explain the quote before they arrive.</h1>
          <p className="lede">
            {brand.name} connects you with laptop repair, network setup, backups, and small-office support in the areas we actually cover.
          </p>
          <div className="hero-finder">
            <form
              className="search-panel"
              onSubmit={(event) => {
                event.preventDefault();
                navigate(query.trim() ? `/services?q=${encodeURIComponent(query.trim())}` : "/services");
              }}
            >
              <label htmlFor="home-search">What do you need help with?</label>
              <div className="search-row">
                <input id="home-search" name="q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Laptop, Wi-Fi, printer…" />
                <button className="btn btn-primary" type="submit">
                  <Icon name="search" size={18} /> Search
                </button>
              </div>
            </form>
            <PostalChooser />
          </div>
        </div>
        <HeroArt />
      </section>
      <section className="container trust" aria-label="How bookings work">
        <article>
          <Icon name="pin" />
          <h2>Area first</h2>
          <p>Slots appear only after your postal code matches a zone operations has opened.</p>
        </article>
        <article>
          <Icon name="shield" />
          <h2>Quote before confirm</h2>
          <p>Fixed fees stay fixed. Diagnosis-required work is labeled as an estimate.</p>
        </article>
        <article>
          <Icon name="check" />
          <h2>A named technician</h2>
          <p>Operations assigns someone who covers the area, the device, and the window.</p>
        </article>
      </section>
      <section className="container">
        <div className="section-head">
          <h2>Browse by category</h2>
          <Link to="/services">All services</Link>
        </div>
        <div className="category-grid">
          {state.categories.map((category) => (
            <Link key={category.id} className="category-card" to={`/services?category=${category.id}`}>
              <CategoryMark id={category.id} />
              <h3>{category.name}</h3>
              <p>{category.blurb}</p>
            </Link>
          ))}
        </div>
      </section>
      <section className="container">
        <div className="section-head">
          <h2>Often booked</h2>
        </div>
        <div className="card-grid">
          {popular.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </section>
      <section className="container steps-band">
        <h2>From pin code to appointment</h2>
        <ol>
          <li>Check the postal code.</li>
          <li>Read the inclusions, exclusions, and price lines.</li>
          <li>Pick a window that still has technician capacity.</li>
          <li>Operations assigns a verified technician. You can follow the status.</li>
        </ol>
      </section>
      <section className="container">
        <div className="section-head">
          <h2>Recent notes from customers</h2>
        </div>
        <div className="card-grid">
          {state.reviews.slice(0, 3).map((review) => (
            <blockquote key={review.id} className="review">
              <Stars rating={review.rating} />
              <p>{review.text}</p>
              <footer>
                {review.customerName} · {review.zoneName} · {review.dateLabel}
              </footer>
            </blockquote>
          ))}
        </div>
      </section>
    </>
  );
}

function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 440 360" role="img" aria-label="Abstract laptop, house, and location pin">
      <rect x="24" y="36" width="392" height="300" rx="28" fill="#e7f3ef" />
      <rect x="70" y="78" width="180" height="120" rx="16" fill="#123f39" />
      <rect x="86" y="94" width="148" height="78" rx="8" fill="#f4f0e7" />
      <path d="M58 214h204" stroke="#123f39" strokeWidth="10" strokeLinecap="round" />
      <path d="M250 150l70-54 70 54v92H250z" fill="#b8612e" />
      <rect x="300" y="176" width="40" height="66" fill="#f4f0e7" />
      <circle cx="332" cy="78" r="26" fill="#f3d7a1" />
      <path d="M332 64v28M318 78h28" stroke="#123f39" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function ServicesPage() {
  useTitle("Services");
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const category = params.get("category") ?? "";
  const mode = params.get("mode") ?? "";
  const rating = Number(params.get("rating") ?? "0");
  const priceCap = Number(params.get("price") ?? "0");
  const when = params.get("when") ?? "";
  const sort = params.get("sort") ?? "featured";
  const zone = state.zones.find((item) => item.id === state.coverage.zoneId) ?? null;

  const results = useMemo(() => {
    const now = new Date();
    const rows = state.services.filter((service) => {
      if (q && !`${service.name} ${service.summary}`.toLowerCase().includes(q)) return false;
      if (category && service.categoryId !== category) return false;
      if (mode && !service.modes.includes(mode as "remote" | "onsite")) return false;
      if (rating && service.rating < rating) return false;
      const quote = previewCardQuote(service, zone, state.areaPrices, now, state.settings.urgencyWithinHours);
      if (priceCap && quote.total > priceCap) return false;
      if (when === "week" && zone) {
        const blocked = coverageMessage(service, zone, zoneHealth(state.providers, zone));
        if (blocked) return false;
        const next = nextOpenSlot(
          listSlots(state, { serviceId: service.id, zoneId: zone.id, mode: service.modes[0] ?? "onsite", deviceType: service.deviceTypes[0] ?? "Laptop" }, now, 7),
        );
        if (!next) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      if (sort === "price") {
        const left = previewCardQuote(a, zone, state.areaPrices, new Date(), state.settings.urgencyWithinHours).total;
        const right = previewCardQuote(b, zone, state.areaPrices, new Date(), state.settings.urgencyWithinHours).total;
        return left - right;
      }
      if (sort === "duration") return a.durationMinutes - b.durationMinutes;
      return b.rating - a.rating;
    });
    return rows;
  }, [state, q, category, mode, rating, priceCap, when, sort, zone]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <div className="container page-block">
      <div className="section-head">
        <div>
          <h1>Services</h1>
          <p>
            {results.length} {results.length === 1 ? "service" : "services"}
            {zone ? ` in ${zone.name}` : ""}. {zone ? "Windows below match this area." : "Set an area to see which visits can actually be booked."}
          </p>
        </div>
      </div>
      <div className="catalog-layout">
        <form className="filters" aria-label="Filter services">
          <label>
            Category
            <select value={category} onChange={(event) => set("category", event.target.value)}>
              <option value="">All</option>
              {state.categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visit type
            <select value={mode} onChange={(event) => set("mode", event.target.value)}>
              <option value="">Any</option>
              <option value="remote">Remote</option>
              <option value="onsite">On-site</option>
            </select>
          </label>
          <label>
            Rating
            <select value={rating ? String(rating) : ""} onChange={(event) => set("rating", event.target.value)}>
              <option value="">Any</option>
              <option value="4.5">4.5 and up</option>
              <option value="4.7">4.7 and up</option>
            </select>
          </label>
          <label>
            Price up to
            <select value={priceCap ? String(priceCap) : ""} onChange={(event) => set("price", event.target.value)}>
              <option value="">Any</option>
              <option value="1000">₹1,000</option>
              <option value="2000">₹2,000</option>
              <option value="4000">₹4,000</option>
            </select>
          </label>
          <label>
            Availability
            <select value={when} onChange={(event) => set("when", event.target.value)}>
              <option value="">Any time</option>
              <option value="week">Open this week</option>
            </select>
          </label>
          <label>
            Sort
            <select value={sort} onChange={(event) => set("sort", event.target.value)}>
              <option value="featured">Rating</option>
              <option value="price">Price</option>
              <option value="duration">Duration</option>
            </select>
          </label>
        </form>
        {results.length === 0 ? (
          <Empty title="No services match" body="Clear a filter or try another category. Coverage still depends on the area you selected." />
        ) : (
          <div className="card-grid">
            {results.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ServiceDetailPage() {
  const { serviceId } = useParams();
  const { state } = useStore();
  const service = state.services.find((item) => item.id === serviceId);
  useTitle(service?.name ?? "Service");
  if (!service) return <div className="container page-block"><Empty title="Service not found" body="That offering is not in the catalog." action={<Link className="btn btn-secondary" to="/services">Back to services</Link>} /></div>;
  const zone = state.zones.find((item) => item.id === state.coverage.zoneId) ?? null;
  const quote = previewCardQuote(service, zone, state.areaPrices, new Date(), state.settings.urgencyWithinHours);
  const health = zone ? zoneHealth(state.providers, zone) : null;
  const blocked = zone && health ? coverageMessage(service, zone, health) : null;
  const next = zone && !blocked ? nextOpenSlot(listSlots(state, { serviceId: service.id, zoneId: zone.id, mode: service.modes[0] ?? "onsite", deviceType: service.deviceTypes[0] ?? "Laptop" }, new Date(), 8)) : undefined;
  const reviews = state.reviews.filter((review) => review.serviceId === service.id);
  const session = state.session;
  return (
    <div className="container page-block detail">
      <p className="eyebrow">
        <Link to="/services">Services</Link> / {service.name}
      </p>
      <div className="detail-grid">
        <div className="stack">
          <h1>{service.name}</h1>
          <p className="lede">{service.description}</p>
          <div className="card-meta">
            <Stars rating={service.rating} count={service.reviewCount} />
            <span>{service.durationMinutes} minutes expected</span>
          </div>
          <section>
            <h2>Included</h2>
            <ul>{service.inclusions.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h2>Not included</h2>
            <ul>{service.exclusions.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h2>Warranty</h2>
            <p>{service.warranty}</p>
          </section>
          <section>
            <h2>Cancellation</h2>
            <p>{service.cancellationNote}</p>
            <p className="hint">Operations can change the cutoff. It is {state.settings.cancellationCutoffHours} hours before the window right now.</p>
          </section>
          {reviews.map((review) => (
            <blockquote key={review.id} className="review">
              <Stars rating={review.rating} />
              <p>{review.text}</p>
              <footer>{review.customerName} · {review.zoneName}</footer>
            </blockquote>
          ))}
        </div>
        <aside className="book-panel">
          <p className="price">{quote.hasEstimate ? "From " : ""}{money(quote.total)}</p>
          <p className="fine">{quote.summaryLabel}. GST is included. {service.modes.includes("onsite") && service.modes.includes("remote") ? "Travel is added only for on-site visits." : null}</p>
          {!zone ? <p className="banner banner-info">Choose a postal code before looking at times. We will not offer slots outside a configured zone.</p> : null}
          {blocked ? <p className="banner banner-warn">{blocked}</p> : null}
          {next ? <p className="banner banner-ok">Next open window: {next.date} · {formatWindow(next.window)}</p> : null}
          {zone && !blocked && session?.role === "customer" ? (
            <Link className="btn btn-primary" to={`/book/${service.id}`}>Continue to booking</Link>
          ) : null}
          {!session ? <Link className="btn btn-primary" to={`/login?next=/book/${service.id}`}>Sign in to book</Link> : null}
          {session && session.role !== "customer" ? <p className="hint">Switch to a customer account to book. Your console is under {homeFor(session.role)}.</p> : null}
          {(!zone || blocked || state.coverage.status === "uncovered") ? (
            <>
              <h2>Ask for coverage</h2>
              <CoverageForm serviceId={service.id} />
              <MockNote>The request is stored for operations. It does not create a booking.</MockNote>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
