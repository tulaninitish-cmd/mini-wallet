import { FLAG_TEXT, formatMinor } from '../money';

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function title(t) {
  if (t.type === 'topup') return 'Added test money';
  return t.direction === 'out' ? `Sent to ${t.counterparty.name}` : `Received from ${t.counterparty.name}`;
}

// A statement: date, what happened, signed amount. Flagged transfers explain why.
export default function Ledger({ items, empty }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ol className="ledger">
      {items.map((t) => {
        const credit = t.direction === 'in';
        return (
          <li key={t.id} className="ledger-row">
            <time className="ledger-date" dateTime={new Date(t.createdAt).toISOString()}>
              {dateFmt.format(t.createdAt)}
            </time>
            <div className="ledger-main">
              <span className="ledger-title">{title(t)}</span>
              {t.note && <span className="ledger-note">{t.note}</span>}
              {t.flagged && (
                <span className="flag">
                  Flagged for review: {t.flagReasons.map((r) => FLAG_TEXT[r] || r).join(', ')}
                </span>
              )}
            </div>
            <span className={`amount ${credit ? 'amount-in' : 'amount-out'}`}>
              {credit ? '+' : '\u2212'}
              {formatMinor(t.amountMinor)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
