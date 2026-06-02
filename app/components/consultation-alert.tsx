/**
 * Jednolity komunikat zwrotny akcji (błąd / sukces) dla tras konsultacji.
 * Zastępuje powielane inline `<p>/<output>` w widokach.
 */
export function ConsultationAlert({
  data,
}: {
  data?: { error?: string; success?: string } | null;
}) {
  if (!data) return null;
  if ("error" in data && data.error) {
    return (
      <p role="alert" className="alert alert-error">
        {data.error}
      </p>
    );
  }
  if ("success" in data && data.success) {
    return (
      <output className="alert alert-ok" style={{ display: "block" }}>
        {data.success}
      </output>
    );
  }
  return null;
}
