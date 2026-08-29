# 04 — Kontrakt API

Katalog zasobów i operacji. Forma: REST po HTTP, ładunek JSON, prefiks wersji `/v1`.

Kolumna **Kto**: `T` = trener, `P` = podopieczny, `—` = bez uwierzytelnienia.

---

## Część I — reguły przekrojowe

### 1. Uwierzytelnianie

- Klient uzyskuje poświadczenia przez operację logowania i przedstawia je przy każdym żądaniu
  w nagłówku `Authorization`.
- Poświadczenia mają **krótki czas życia** i są odnawiane osobną operacją. Odnowienie musi dać
  się unieważnić — zarówno pojedynczo (wylogowanie), jak i hurtowo dla użytkownika („wyloguj
  ze wszystkich urządzeń”).
- Sposób przechowywania poświadczeń po stronie klienta jest sprawą klienta. Aplikacja webowa
  trzyma je poza zasięgiem skryptów w przeglądarce; aplikacja mobilna w bezpiecznym magazynie
  systemu.
- Odpowiedź na nieudane logowanie **nie może zdradzać, czy konto istnieje** — ani treścią,
  ani czasem odpowiedzi.

### 2. Izolacja najemców i autoryzacja

- Każde żądanie działa w granicach tenanta wyprowadzonego z poświadczeń. **Identyfikator
  trenera nigdy nie jest przyjmowany z ładunku żądania.**
- **Sięgnięcie po cudzy zasób zwraca `404`, nie `403`.** Zasób spoza tenanta jest nieodróżnialny
  od nieistniejącego. Ta reguła obowiązuje także dla operacji zapisu i dla nieistniejących
  identyfikatorów w ciele żądania.
- `403` jest zarezerwowane dla naruszenia reguły roli w obrębie własnego tenanta (np. podopieczny
  próbuje operacji trenera).
- Podopieczny bez aktywnego dostępu płatniczego otrzymuje **`402`** na wszystkich zasobach
  domenowych poza aktywacją subskrypcji i podsumowaniami miesięcznymi. Podopieczny z
  niewypełnionym formularzem startowym otrzymuje **`403`** na tych samych zasobach. Kolejność
  sprawdzania: najpierw dostęp płatniczy, potem formularz.

### 3. Kody odpowiedzi

| Kod | Kiedy |
|---|---|
| `200` | Odczyt lub operacja zwracająca treść |
| `201` | Utworzenie zasobu |
| `204` | Operacja bez treści odpowiedzi |
| `400` | Ładunek nie przechodzi walidacji |
| `401` | Brak lub nieważne poświadczenia |
| `402` | Brak aktywnego dostępu płatniczego |
| `403` | Naruszenie reguły roli albo niewypełniony formularz startowy |
| `404` | Zasób nie istnieje **albo należy do innego tenanta** |
| `409` | Naruszenie niezmiennika domenowego (np. drugi aktywny plan, cykl w grafie) |
| `413` | Plik przekracza limit rozmiaru dla swojego rodzaju |
| `429` | Przekroczony limit liczby żądań; odpowiedź niesie czas do ponowienia |
| `500` | Błąd po stronie serwera |

### 4. Format błędu

Jednolity dla wszystkich operacji:

```json
{
  "error": {
    "code": "PLAN_ALREADY_ACTIVE",
    "message": "Ten podopieczny ma już aktywny plan.",
    "details": { "planId": "…" }
  }
}
```

- `code` jest **stabilnym identyfikatorem maszynowym** — klienci rozgałęziają logikę na nim,
  nigdy na treści komunikatu.
- `message` jest tekstem dla użytkownika. Produkt jest polskojęzyczny.
- `details` jest opcjonalne i przeznaczone dla klienta, nie dla człowieka.
- Błąd walidacji wskazuje pole, którego dotyczy.

### 5. Listy: stronicowanie, sortowanie, filtrowanie

Wszystkie listy sterowane parametrami zapytania: `page`, `sort`, `q` oraz filtrami właściwymi dla
zasobu. Odpowiedź niesie pozycje i metadane:

```json
{ "items": [ … ], "page": 1, "totalPages": 4, "total": 73 }
```

- Rozmiary stron są **stałe per zasób** (patrz dokument 01, sekcja *Limity*) — klient ich nie
  wybiera.
- **Licznik i lista muszą używać identycznego zestawu warunków.** Rozjazd daje stronę bez wyników.
- Wartość `page` przekraczająca zakres jest przycinana do ostatniej istniejącej strony.
- Nieznana wartość filtra jest **ignorowana**, nie powoduje błędu i nie zawęża wyniku do pustego.

### 6. Idempotencja

- Operacje, które klient może ponowić po zerwaniu połączenia — przede wszystkim **zapis
  treningu** i **wysyłka formularza startowego** — przyjmują klucz idempotencji nadany przez
  klienta. Powtórzenie z tym samym kluczem zwraca pierwotny wynik, nie tworzy drugiego zapisu.
- Zdarzenia przychodzące od dostawcy płatności są idempotentne po identyfikatorze zdarzenia.
- Materializacja terminów konsultacji jest idempotentna z natury.

### 7. Wersjonowanie

- Wersja w ścieżce: `/v1`.
- W obrębie wersji zmiany są **wyłącznie addytywne**: wolno dodać pole i opcjonalny parametr,
  nie wolno usunąć pola, zmienić jego typu ani znaczenia.
- Wycofanie wersji wymaga okna liczonego w miesiącach — aplikacja mobilna na cudzym telefonie
  żyje w starej wersji tak długo, jak użytkownik zechce.

### 8. Pliki

- Zawartość plików **nie przechodzi przez zasoby domenowe**. Wysyłka i pobranie mają własne
  operacje.
- **Rodzaj pliku wynika z użytej operacji**, nie z ładunku — dzięki temu klient nie może podszyć
  się pod inny rodzaj.
- Typ jest weryfikowany po zawartości. Weryfikacja musi nastąpić przed uznaniem pliku za zdatny
  do użycia, niezależnie od tego, czy bajty przeszły przez serwer.
- Odczyt wyłącznie przez odnośnik ograniczony czasowo i związany z tenantem. Modele odczytu
  zwracają **gotowy odnośnik**, nie surowy identyfikator.
- Identyfikator nagrania przekazany przy zapisie treningu **sam w sobie niczego nie uprawnia** —
  wymaga weryfikacji zgodnie z niezmiennikami kontekstu 4.

---

## Część II — zasoby domenowe

### Uwierzytelnianie i konto

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `POST` | `/v1/auth/login` | — | Logowanie adresem e-mail i hasłem. Zwraca poświadczenia i profil. Limit prób. |
| `POST` | `/v1/auth/refresh` | — | Odnowienie poświadczeń. Unieważnia poprzednie. |
| `POST` | `/v1/auth/logout` | T·P | Unieważnia bieżące poświadczenia. |
| `POST` | `/v1/auth/logout-all` | T·P | Unieważnia poświadczenia na wszystkich urządzeniach. |
| `GET` | `/v1/me` | T·P | Profil: rola, nazwa wyświetlana, e-mail, przynależność do trenera. |

### Zaproszenia i onboarding

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `POST` | `/v1/invites` | T | Tworzy zaproszenie. Opcjonalnie kwota miesięczna i formularz startowy (1–12 ćwiczeń + notatka). **Zaproszenie i formularz powstają atomowo.** Zwraca token i gotowy odnośnik. |
| `GET` | `/v1/invites/{token}` | — | Sprawdza ważność. `404` gdy nie istnieje, zużyte albo wygasłe. Zwraca nazwę i e-mail do wstępnego wypełnienia. |
| `POST` | `/v1/invites/{token}/accept` | — | Przyjmuje zaproszenie: zakłada lub odnawia konto, ustawia hasło, zużywa zaproszenie, przypina formularz. Zwraca poświadczenia. Limit prób. |
| `GET` | `/v1/me/onboarding-form` | P | Oczekujący formularz z pozycjami i **zamrożoną jednostką**. `404` gdy brak. |
| `POST` | `/v1/me/onboarding-form` | P | Wysyła komplet odpowiedzi. Odrzuca niekompletne i powtórne wysłanie (`409`). |
| `GET` | `/v1/trainees/{traineeId}/onboarding-form` | T | Wyniki formularza podopiecznego. `404` gdy nie dołączono. |

### Biblioteka ćwiczeń

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `GET` | `/v1/exercises` | T | Lista. Filtry: `tag`, `unit`; `sort`, `q`, `page`. |
| `POST` | `/v1/exercises` | T | Tworzy ćwiczenie. Tagi spoza kategorii trenera są odrzucane. |
| `GET` | `/v1/exercises/{id}` | T | Szczegół wraz z odnośnikiem do demo. |
| `PATCH` | `/v1/exercises/{id}` | T | Aktualizuje. Podmiana demo w tej samej operacji. |
| `POST` | `/v1/exercises/{id}/archive` | T | `409`, gdy ćwiczenie jest wariantem aktywnej umiejętności — odpowiedź wskazuje którą. |
| `POST` | `/v1/exercises/{id}/restore` | T | Cofa archiwizację. |
| `GET` | `/v1/exercise-categories` | T | Kategorie trenera. |
| `POST` | `/v1/exercise-categories` | T | Dodaje kategorię. |
| `DELETE` | `/v1/exercise-categories/{id}` | T | Usuwa kategorię. |

### Plany treningowe

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `GET` | `/v1/plans` | T | Lista z nazwą podopiecznego i liczbą sesji. Filtr `status`; `sort`, `q`, `page`. Zarchiwizowane wykluczone. |
| `POST` | `/v1/plans` | T | Tworzy pusty plan dla wskazanego podopiecznego. `409`, gdy szkic już istnieje — odpowiedź wskazuje istniejący. |
| `GET` | `/v1/plans/{id}` | T | Pełne drzewo planu. |
| `PUT` | `/v1/plans/{id}` | T | Zapisuje całe drzewo szkicu. Dozwolone wyłącznie dla stanu `draft`. |
| `POST` | `/v1/plans/{id}/draft` | T | Tworzy szkic jako głęboką kopię planu aktywnego. Zwraca istniejący, jeśli już jest. |
| `POST` | `/v1/plans/{id}/publish` | T | Publikuje szkic; poprzedni aktywny trafia do archiwum. Atomowe. |
| `DELETE` | `/v1/plans/{id}` | T | Szkic bez logów — usuwa trwale. Plan z logami — archiwizuje. |
| `GET` | `/v1/trainees/{traineeId}/plans` | T | Wszystkie plany pary, **łącznie z zarchiwizowanymi**. |
| `GET` | `/v1/me/plan` | P | Aktywny plan z pełnym drzewem sesji. `404` gdy brak. |
| `GET` | `/v1/me/plan/sessions/{sessionId}` | P | Sesja z odnośnikami do demo ćwiczeń. |

### Dziennik treningowy

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `POST` | `/v1/workout-logs` | P | Zapisuje trening. Niesie identyfikatory nagrań, nie bajty. Atomowe, idempotentne kluczem klienta. Zwraca log i **listę pobitych rekordów**. |
| `GET` | `/v1/me/workout-logs` | P | Historia własna. Filtr `video` (`all`/`with`/`without`); `sort`, `q`, `page`. |
| `GET` | `/v1/me/workout-logs/{id}` | P | Szczegół z podpisanymi nagraniami. |
| `GET` | `/v1/trainees/{traineeId}/workout-logs` | T | Historia podopiecznego, te same filtry. |
| `GET` | `/v1/trainees/{traineeId}/workout-logs/{id}` | T | Szczegół z podpisanymi nagraniami. |

### Sylwetka

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `GET` | `/v1/me/body-photos` | P | Własne zdjęcia; `sort`, `page`. |
| `POST` | `/v1/me/body-photos` | P | Dodaje zdjęcie: ujęcie i data. |
| `DELETE` | `/v1/me/body-photos/{id}` | P | Usuwa zdjęcie wraz z zawartością. |
| `GET` | `/v1/trainees/{traineeId}/body-photos` | T | Galeria podopiecznego wraz z parami „przed / po”. |

### Umiejętności — definicje

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `GET` | `/v1/skills` | T | Umiejętności trenera pogrupowane po stopniu trudności. |
| `POST` | `/v1/skills` | T | Tworzy umiejętność. |
| `GET` | `/v1/skills/{id}` | T | Szczegół: warianty, prerekwizyty, kandydaci, **konflikty stopni**. |
| `PATCH` | `/v1/skills/{id}` | T | Aktualizuje nazwę, opis, stopień. Zmiana stopnia **nie jest blokowana** — konflikty są raportowane. |
| `POST` | `/v1/skills/{id}/archive` | T | Archiwizuje i czyści krawędzie prerekwizytów. |
| `POST` | `/v1/skills/{id}/variations` | T | Dodaje ćwiczenie jako wariant. `409`, gdy ćwiczenie jest już wariantem gdzie indziej albo jest zarchiwizowane. |
| `DELETE` | `/v1/skills/{id}/variations/{variationId}` | T | Usuwa wariant i przepakowuje kolejność. `409`, gdy istnieją zdarzenia awansu wskazujące ten wariant. |
| `PUT` | `/v1/skills/{id}/variations/order` | T | Ustala kolejność drabiny. |
| `POST` | `/v1/skills/{id}/prerequisites` | T | Dodaje krawędź. `409` przy cyklu **oraz** przy prerekwizycie o wyższym stopniu. |
| `DELETE` | `/v1/skills/{id}/prerequisites/{requiresSkillId}` | T | Usuwa krawędź. |

### Umiejętności — postęp podopiecznego

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `GET` | `/v1/trainees/{traineeId}/skill-progress` | T | Mapa wszystkich umiejętności z bieżącym wariantem, historią i **sugestią awansu**. |
| `GET` | `/v1/me/skill-progress` | P | To samo bez sugestii. Tylko odczyt. |
| `POST` | `/v1/trainees/{traineeId}/skills/{skillId}/starting-level` | T | Ustala poziom startowy. Dozwolone raz. |
| `POST` | `/v1/trainees/{traineeId}/skills/{skillId}/advancements` | T | Rejestruje awans albo cofnięcie jako **nowe zdarzenie**. `409` bez poziomu startowego i przy awansie na ten sam poziom. |
| `GET` | `/v1/trainees/{traineeId}/skills/{skillId}/history` | T·P | Strumień zdarzeń. Opcjonalny parametr `at` — stan na wskazany moment. |

### Konsultacje

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `GET` | `/v1/trainees/{traineeId}/consultation-schedule` | T | Aktywny harmonogram pary. |
| `PUT` | `/v1/trainees/{traineeId}/consultation-schedule` | T | Zapisuje harmonogram, materializuje przyszłe terminy, anuluje stare niepotwierdzone. |
| `DELETE` | `/v1/trainees/{traineeId}/consultation-schedule` | T | Wyłącza harmonogram. |
| `GET` | `/v1/consultations` | T·P | Terminy w zakresie `from`–`to`. Trener widzi wszystkich swoich podopiecznych, podopieczny tylko własne. Odwołane pomijane. |
| `POST` | `/v1/consultations` | T | Termin poza serią: od razu `planned` albo od razu `documented`. |
| `GET` | `/v1/consultations/{id}` | T·P | Szczegół: status, moment, odnośnik, notatka prośby o zmianę, podsumowanie, punkty akcji. |
| `POST` | `/v1/consultations/{id}/respond` | P | `confirm` · `request_change` (z notatką) · `decline`. `409` przy niedozwolonym przejściu. |
| `POST` | `/v1/consultations/{id}/reschedule` | T | Przekłada na nowy moment. |
| `POST` | `/v1/consultations/{id}/cancel` | T | Odwołuje. |
| `POST` | `/v1/consultations/{id}/document` | T | Zapisuje podsumowanie i punkty akcji. Podmienia dotychczasowe punkty. |
| `PATCH` | `/v1/consultations/{id}/action-items/{itemId}` | T·P | Zmienia status punktu: `open` / `resolved`. |
| `DELETE` | `/v1/consultations/{id}` | T | Usuwa termin. |
| `POST` | `/v1/trainees/{traineeId}/consultation-sync` | T | Ręczne uzupełnienie zaległości w kalendarzu zewnętrznym. Zwraca liczbę prób i sukcesów; przy braku połączenia mówi o tym wprost, zamiast raportować „0 z 0”. |

### Płatności

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `GET` | `/v1/billing/connection` | T | Stan konta rozliczeniowego wraz z informacją, czy onboarding jest dokończony. |
| `POST` | `/v1/billing/connection` | T | Rozpoczyna lub wznawia onboarding. Zwraca odnośnik do przekierowania. |
| `GET` | `/v1/trainees/{traineeId}/subscription` | T | Stan subskrypcji i kwota. |
| `PUT` | `/v1/trainees/{traineeId}/subscription/amount` | T | Ustala kwotę miesięczną. Przy aktywnej subskrypcji odpowiedź informuje, że zmiana wejdzie od następnego odnowienia. |
| `GET` | `/v1/me/subscription` | P | Stan własnej subskrypcji i dostępne akcje. |
| `POST` | `/v1/me/subscription/checkout` | P | Rozpoczyna opłacenie. Zwraca odnośnik. `409`, gdy trener nie ustalił ceny. |
| `POST` | `/v1/me/subscription/portal` | P | Otwiera portal zarządzania płatnością. Zwraca odnośnik. |
| `POST` | `/v1/me/subscription/pause` · `/resume` | P | Wstrzymuje i wznawia. |
| `POST` | `/v1/trainees/{traineeId}/subscription/pause` · `/resume` · `/cancel` | T | To samo po stronie trenera; `cancel` dozwolone dla `active` i `past_due`. |
| `GET` | `/v1/me/payments` | P | Historia faktur. |
| `GET` | `/v1/trainees/{traineeId}/payments` | T | Historia faktur pary. |

### Zgłoszenia

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `GET` | `/v1/me/feature-requests` | P | Własne zgłoszenia z odpowiedziami. Filtr `status`; `sort`, `page`. |
| `POST` | `/v1/me/feature-requests` | P | Tworzy zgłoszenie. Trener wynika z konta autora, **nigdy z ładunku**. |
| `DELETE` | `/v1/me/feature-requests/{id}` | P | Usuwa **wyłącznie** w stanie `new`; warunek egzekwowany przy zapisie. |
| `GET` | `/v1/feature-requests` | T | Skrzynka wszystkich podopiecznych. Filtry `status`, `kind`; `q`, `sort`, `page`. |
| `GET` | `/v1/feature-requests/{id}` | T | Szczegół. |
| `POST` | `/v1/feature-requests/{id}/response` | T | Ustala stan i opcjonalną odpowiedź. Pusta odpowiedź kasuje treść i **nie** stempluje daty. |

### Pliki

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `POST` | `/v1/files/set-video` | P | Nagranie serii. Limit ~30 MB. Zwraca identyfikator do użycia przy zapisie treningu. Podlega obu bramkom wejścia i limitowi liczby wysyłek. |
| `POST` | `/v1/files/body-photo` | P | Zdjęcie sylwetki. |
| `POST` | `/v1/files/exercise-demo` | T | Wideo demonstracyjne. |
| `POST` | `/v1/files/{id}/confirm` | T·P | Potwierdza zdatność pliku po wysyłce — wymagane, jeśli bajty nie przeszły przez serwer i typ nie mógł zostać zweryfikowany w locie. |
| `GET` | `/v1/files/{id}` | T·P | Pobranie po podpisanym odnośniku. Obsługuje pobieranie częściowe. |

### Kalendarz zewnętrzny

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `GET` | `/v1/calendar/connection` | T | Stan połączenia. |
| `POST` | `/v1/calendar/connection/authorize` | T | Rozpoczyna autoryzację. Zwraca odnośnik. Chronione przed fałszowaniem żądania. |
| `GET` | `/v1/calendar/connection/callback` | T | Odbiera autoryzację, zapisuje poświadczenia w postaci zaszyfrowanej. Zawsze przekierowuje. |
| `DELETE` | `/v1/calendar/connection` | T | Rozłącza i, w miarę możliwości, unieważnia poświadczenia u dostawcy. |

### Zdarzenia przychodzące

| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| `POST` | `/v1/webhooks/payments` | — | Zdarzenia dostawcy płatności. **Podpis weryfikowany na surowej treści żądania** — przed jakimkolwiek parsowaniem. `400` przy braku lub złym podpisie. `500` przy błędzie przetwarzania, żeby dostawca ponowił. `200` w pozostałych, także dla duplikatu. |

---

## Część III — modele odczytu

Wolno im agregować przez konteksty. **Nie wolno im niczego zmieniać.** Oznaczone w kontrakcie
jako osobna rodzina, bo mogą zmieniać się częściej niż zasoby domenowe.

| Metoda | Ścieżka | Kto | Zasila ekran |
|---|---|---|---|
| `GET` | `/v1/me/nav` | P | Powłoka podopiecznego: liczniki i odznaki, **po sprawdzeniu obu bramek** |
| `GET` | `/v1/trainer/nav` | T | Powłoka trenera: liczniki i odznaka nowych zgłoszeń |
| `GET` | `/v1/me/home` | P | Pulpit podopiecznego |
| `GET` | `/v1/trainer/home` | T | Pulpit trenera |
| `GET` | `/v1/trainees/{traineeId}/overview` | T | Widok klienta: wskaźniki, mapa aktywności, stagnacja, wykorzystanie planu, pokrycia, rozkład tagów |
| `GET` | `/v1/me/development` | P | Rozwój: drzewo umiejętności ze stanami plus lista pozostałych ćwiczeń |
| `GET` | `/v1/trainees/{traineeId}/development` | T | To samo dla wskazanego podopiecznego |
| `GET` | `/v1/me/progression/{exerciseId}` | P | Progresja ćwiczenia; parametr zakresu czasowego |
| `GET` | `/v1/trainees/{traineeId}/progression/{exerciseId}` | T | To samo dla podopiecznego |
| `GET` | `/v1/me/progression/comparison` | P | Porównanie ćwiczeń (`ex`, zakres); wartości znormalizowane |
| `GET` | `/v1/trainees/{traineeId}/progression/comparison` | T | To samo dla podopiecznego |
| `GET` | `/v1/me/wrapped` | P | Lista miesięcy z danymi |
| `GET` | `/v1/me/wrapped/{ym}` | P | Podsumowanie miesiąca. `404`, gdy brak danych |

---

## Część IV — wartości wyliczeniowe

**Dokładne** wartości występujące dziś w danych produkcyjnych. Zmiana którejkolwiek to migracja
danych, nie zmiana kodu.

| Zbiór | Wartości |
|---|---|
| Rola użytkownika | `trainer` · `trainee` |
| Jednostka ćwiczenia | `REPS` · `SEC` |
| Rodzaj pliku | `exercise_demo` · `set_video` · `body_photo` |
| Stan planu | `draft` · `active` · `archived` |
| Rodzaj bloku | `single` · `superset` · `dropset` |
| Ujęcie zdjęcia | `front` · `side` · `back` |
| Stan terminu | `planned` · `confirmed` · `change_requested` · `cancelled` · `documented` |
| Częstotliwość cyklu | `weekly` · `biweekly` · `monthly` |
| Stan punktu akcji | `open` · `resolved` |
| Stan subskrypcji | `none` · `incomplete` · `active` · `past_due` · `canceled` · `unpaid` · `paused` |
| Stopień umiejętności | `basic` · `intermediate` · `advanced` · `expert` |
| Rodzaj zgłoszenia | `idea` · `bug` · `other` |
| Stan zgłoszenia | `new` · `considering` · `planned` · `done` · `rejected` |

> Uwaga na pisownię: stan subskrypcji to `canceled` (jedno „l”, za dostawcą płatności), a stan
> terminu konsultacji to `cancelled` (dwa „l”). Ta niekonsekwencja istnieje w danych i nie da
> się jej poprawić bez migracji.

---

## Część V — czego kontrakt świadomie nie zawiera

- **Operacji rejestracji trenera.** Konta trenerów powstają operacyjnie.
- **Operacji edycji zapisanego treningu.** Log jest zapisem faktu.
- **Odczytu zmian z kalendarza zewnętrznego.** Synchronizacja jest jednokierunkowa.
- **Zasobów udostępniających dane między trenerami.** Nie istnieje żaden odczyt przecinający
  granicę tenanta.
- **Operacji masowych** (import, eksport, hurtowe wgrywanie).
