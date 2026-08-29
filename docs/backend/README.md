# docs/backend/ — materiały do budowy backendu

Komplet dokumentacji **produktowo-domenowej** dla osoby budującej backend kalisthenos jako
osobną usługę. Opisuje **co** system robi i **jaki kontrakt** wystawia — świadomie **nie**
opisuje, jak ma być zbudowany.

## Czego tu NIE ma (celowo)

Żadnych decyzji technologicznych ani architektonicznych: frameworka, ORM-a, struktury
katalogów, sposobu przechowywania sesji, magazynu plików, cache'a, kolejek, warstw, wzorców
implementacyjnych. To są decyzje osoby budującej backend. Dokumenty opisują wyłącznie
domenę, reguły biznesowe i kontrakt wystawiany klientom.

Jedyne założenie o formie kontraktu: **REST po HTTP z ładunkiem JSON** — bo kontrakt trzeba
w czymś zapisać, a ta forma została wybrana wcześniej (aplikacja webowa i mobilna mają jeść
z tego samego talerza). Poza tym dokumenty są agnostyczne.

## Dokumenty

| Plik | Zawartość |
|---|---|
| [`01-zakres-funkcjonalny.md`](01-zakres-funkcjonalny.md) | Co system robi: aktorzy, trzynaście obszarów funkcjonalnych, reguły biznesowe, bramki wejścia, limity, non-goals. Czytaj jako pierwsze. |
| [`02-domena-i-konteksty.md`](02-domena-i-konteksty.md) | Podział na subdomeny (core/supporting/generic), mapa dwunastu kontekstów i relacji między nimi, słownik pojęć wraz z pułapkami językowymi, zasoby domenowe z niezmiennikami i maszynami stanów, zdarzenia domenowe. |
| [`03-modele-odczytu.md`](03-modele-odczytu.md) | Ekran po ekranie: jakich danych potrzebuje każdy widok. Materiał do projektowania odczytowej strony API bez zgadywania. |
| [`04-kontrakt-api.md`](04-kontrakt-api.md) | Katalog zasobów i operacji: metoda, ścieżka, wejście, wyjście, błędy, wymagana autoryzacja. Plus reguły przekrojowe: uwierzytelnianie, izolacja najemców, format błędów, paginacja, idempotencja, dostęp do plików. |

## Skąd to pochodzi

Dokumenty są wyprowadzone z działającej aplikacji fullstack (React Router v7 + PostgreSQL):
68 plików tras, 28 tabel, 18 migracji. Nie są projektem „na zielonej łące" — opisują system,
który działa i ma użytkowników. Gdziekolwiek reguła wygląda dziwnie, jest to zwykle ślad po
konkretnym błędzie lub decyzji produktowej; takie miejsca są opatrzone uzasadnieniem.

Analiza, z której wyrosły: [`../superpowers/specs/2026-07-28-rozbicie-fe-be-analiza-ddd-design.md`](../superpowers/specs/2026-07-28-rozbicie-fe-be-analiza-ddd-design.md).

## Stan istniejących danych

Backend nie startuje na pustej bazie — przejmuje istniejący schemat z danymi produkcyjnymi.
Wartości wyliczeniowe podane w dokumentach są **dokładnymi** wartościami zapisanymi dziś
w bazie; zmiana którejkolwiek wymaga migracji danych, nie tylko zmiany kodu.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
