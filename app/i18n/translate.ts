/**
 * Tłumaczy klucz DYNAMICZNY — nieznany w czasie kompilacji. Ściśle typowane
 * `t()` (patrz `i18next.d.ts`) przyjmuje wyłącznie literały kluczy, więc dla
 * wartości typu `string` (np. `labelKey` z warstwy lib — `consultationPresentation`,
 * `subscriptionPresentation`, `invoiceStatusLabelKey` — albo klucz komunikatu
 * zwrócony z `action()`) używamy tego cienkiego wrappera. Klucz może mieć prefiks
 * namespace (np. `konsultacje:status.done`).
 */
export function tDyn(
  // biome-ignore lint/suspicious/noExplicitAny: typowane t() ma złożone przeciążenia; tu celowo luźny podpis dla kluczy dynamicznych.
  t: (...args: any[]) => string,
  key: string,
  options?: Record<string, unknown>,
): string {
  return t(key, options);
}
