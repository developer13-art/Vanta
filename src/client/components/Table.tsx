import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  rowKey: (row: T) => string;
}

export function Table<T>({ columns, rows, emptyMessage, rowKey }: Props<T>): JSX.Element {
  if (rows.length === 0) {
    return <div style={{ padding: '32px 0', color: 'var(--text-muted)', textAlign: 'center' }}>{emptyMessage ?? 'No data'}</div>;
  }
  return (
    <table className="table">
      <thead>
        <tr>{columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((c) => <td key={c.key}>{c.render(row)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}