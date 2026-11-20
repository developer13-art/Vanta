import React from 'react';

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, id, ...rest }: Props): JSX.Element {
  return (
    <div className="field">
      {label && <label htmlFor={id} className="label">{label}</label>}
      <input id={id} {...rest} className="input" />
      {error && <div className="error">{error}</div>}
    </div>
  );
}