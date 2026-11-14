// Inline feedback. Errors say what happened; success says what changed.
export default function Notice({ kind = 'error', children }) {
  if (!children) return null;
  return (
    <p className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
