import React from 'react';

interface Props extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string | null;
  options: Array<{ value: string; label: string }>;
}

export function Select({ label, error, id, options, ...rest }: Props): JSX.Element {
  return (
    <div className="field">
      {label && <label htmlFor={id} className="label">{label}</label>}
      <select id={id} {...rest} className="input">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <div className="error">{error}</div>}
    </div>
  );
}