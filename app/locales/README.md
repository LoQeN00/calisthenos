# app/locales/ — słowniki tłumaczeń (JSON)

Pliki JSON z tłumaczeniami pogrupowane według języka i namespace'u i18next.
Każdy język to podkatalog (`pl/`, `fr/`), każdy plik to jeden namespace.

Język `pl` jest źródłem prawdy kluczy — zmiany struktury kluczy rób w `pl/`, a
następnie zsynchronizuj `fr/`. Test parzystości (`parity.test.ts`) pilnuje, że
oba języki mają identyczny zestaw kluczy we wszystkich namespace'ach.

## Podkatalogi

| Katalog | Zawartość |
|---|---|
| `pl/` | Słowniki polskie — po jednym pliku JSON na namespace (patrz tabela niżej). |
| `fr/` | Słowniki francuskie — lustro `pl/` (te same pliki i klucze). |

## Pliki w tym katalogu

| Plik | Rola |
|---|---|
| `parity.test.ts` | Test Vitest sprawdzający, że każdy język ma dokładnie te same klucze co `pl` w każdym namespace. |

## Namespace'y

| Namespace | Plik | Zakres |
|---|---|---|
| `common` | `common.json` | Wspólne etykiety i współdzielone komponenty display (renderowane u trenera i podopiecznego): nazwa aplikacji (`app.name`), nawigacja (`nav.*`), akcje (`action.*`), menu/kontrolki/paginacja (`menu.*`, `controls.*`, `pagination.*`), potwierdzenia (`confirm.*`), drzewo umiejętności (`skillTree.*`), progresja/wykresy/lista (`progression.*`), zdjęcia sylwetki (`photo.*`), cockpit zdrowia klienta (`health.*`). |
| `auth` | `auth.json` | Logowanie (`login.*`) i zaproszenie. |
| `konsultacje` | `konsultacje.json` | Konsultacje współdzielone: statusy (`status.*`, używane przez `consultationPresentation().labelKey`) + widoki kalendarza/agendy/szczegółów podopiecznego. |
| `platnosci` | `platnosci.json` | Płatności współdzielone: statusy subskrypcji/faktur (`subStatus.*`, `invoiceStatus.*`, używane przez `labelKey`) + widok płatności podopiecznego. |
| `podopieczny` | `podopieczny.json` | Widoki podopiecznego: pulpit, sesje, loguj, historia, statystyki, rozwój, sylwetka, wrapped, aktywacja subskrypcji. |
| `trener` | `trener.json` | Trener: pulpit + biblioteka ćwiczeń (+ `CategoryPicker`). |
| `trenerPlany` | `trenerPlany.json` | Trener: plany, umiejętności, integracje (Google/Stripe). |
| `trenerPodopieczni` | `trenerPodopieczni.json` | Trener: lista i szczegóły podopiecznego, log treningu, sylwetka, płatności. |
| `trenerRozwoj` | `trenerRozwoj.json` | Trener: rozwój podopiecznego (drzewo umiejętności, progresja, porównanie). |
| `trenerKonsultacje` | `trenerKonsultacje.json` | Trener: kalendarz konsultacji, formularz nowej konsultacji, szczegóły (+ `ConsultationForm`). |
| `marka` | `marka.json` | Panel prezesa marki (`/marka/*`). |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
