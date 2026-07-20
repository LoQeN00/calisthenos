# app/i18n/ — konfiguracja i zasoby i18next

Moduły konfiguracyjne i typowania dla wielojęzyczności (i18next).

## Pliki

| Plik | Rola |
|---|---|
| `config.ts` | `SUPPORTED_LANGS`, `NAMESPACES`, `FALLBACK_LANG`, `DEFAULT_NS`, `langToIntlLocale`, `localeToLang`. Źródło prawdy konfiguracji i18n. |
| `pick-lang.ts` | Funkcja `pickLang` — wybiera język z region locale, locale zaproszenia lub nagłówka `Accept-Language`. |
| `pick-lang.test.ts` | Testy jednostkowe `pickLang`. |
| `resources.ts` | Importuje słowniki JSON z `~/locales/` i eksportuje obiekt `resources` (pl + fr, wszystkie namespace'y z `NAMESPACES`). Eksportuje też typ `PlResources` (pl jako źródło prawdy kluczy). |
| `translate.ts` | `tDyn(t, key, options?)` — wrapper do tłumaczenia kluczy DYNAMICZNYCH (nieznanych w czasie kompilacji: `labelKey` z warstwy lib, klucze komunikatów z `action()`), których ściśle typowane `t()` nie przyjmuje. |
| `i18next.d.ts` | Augmentacja modułu `i18next` — wiąże `CustomTypeOptions.resources` z `PlResources`, dzięki czemu `t(...)` jest ściśle typowane. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
