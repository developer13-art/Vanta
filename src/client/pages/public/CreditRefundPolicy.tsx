import React from 'react';

export function CreditRefundPolicy(): JSX.Element {
  return (
    <div className="public-section">
      <h2>Credit and Refund Policy</h2>
      <p>
        Purchased credits never expire. Free and promotional credits may have campaign-specific
        expiry disclosed before acceptance. Credits represent platform usage — not trading capital,
        not a deposit, not a financial instrument, and not withdrawable cash.
      </p>
      <p>
        Refunds for purchases are handled case-by-case. Contact support with your payment reference.
        Credits used are non-refundable. If we made a billing error, we will reverse it via ledger entry.
      </p>
      <p>
        At zero credits, new billable entries and discretionary AI are blocked. Existing positions
        remain in management-only safety mode, and emergency safety actions stay free.
      </p>
    </div>
  );
}