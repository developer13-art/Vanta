import React from 'react';

export function Privacy(): JSX.Element {
  return (
    <div className="public-section">
      <h2>Privacy Policy</h2>
      <p>
        VANTA collects the information required to operate the platform: your name, email, country,
        broker credentials (encrypted at rest using AES-256-GCM), and trading activity metadata.
      </p>
      <p>
        Broker passwords are encrypted and are never shown in the browser, in logs, or in admin views.
        We do not sell or share personal data with third parties except as required to operate
        the service (MetaApi for broker connectivity, Paystack for payments, SMTP for email).
      </p>
      <p>You may request account export or deletion by contacting support.</p>
    </div>
  );
}