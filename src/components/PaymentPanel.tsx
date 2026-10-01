import { money } from "../domain/format";
import { authorizePayment, integrationNotes } from "../integrations/mocks";
import type { Quote } from "../types";
import { MockNote, QuoteView } from "./ui";

export function PaymentPanel({ quote }: { quote: Quote }) {
  const attempt = authorizePayment(quote.total);
  return (
    <section className="payment-panel stack" aria-label="Cost and payment">
      <div>
        <h3>Cost summary</h3>
        <p className="hint">
          {quote.hasEstimate
            ? "Fixed fees stay as shown. Labor, parts, and any starting repair price can change after diagnosis."
            : "This visit uses a fixed price. The total does not depend on a later diagnosis."}
        </p>
      </div>
      <QuoteView quote={quote} />
      <p>
        Fixed portion {money(quote.fixedPortion)}. Estimated portion {money(quote.estimatedPortion)}.
      </p>
      <h3>Payment status</h3>
      <p>
        <span className="status status-warn">Not collected</span>
      </p>
      <p>{attempt.message}</p>
      <h3>Payment methods</h3>
      <ul className="method-list">
        <li>
          <span>UPI</span>
          <span className="status status-neutral">Unavailable</span>
        </li>
        <li>
          <span>Card</span>
          <span className="status status-neutral">Unavailable</span>
        </li>
        <li>
          <span>Cash with the technician</span>
          <span className="status status-neutral">Not recorded</span>
        </li>
      </ul>
      <p>
        <strong>Receipt.</strong> None. No card, UPI id, or other payment detail is stored.
      </p>
      <MockNote>{integrationNotes.payments}</MockNote>
    </section>
  );
}
