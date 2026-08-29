Plan analizy DDD istniejącego systemu Remix 0. Ustal driver, zanim zaczniesz modelować

Rozbicie FE/BE ≠ mikroserwisy. Domyślnym targetem powinien być jeden deployowalny backend (modularny monolit) z twardymi granicami modułów, a osobno wydzielasz tylko to, co ma realnie inny profil skalowania/SLA. Zapisz konkretnie: co ma się skalować, jaki ruch, ilu ludzi będzie to utrzymywać. To będzie kryterium rozstrzygające późniejsze spory.

1. Inwentaryzacja (materiał wejściowy)

Z Remixa wyciągnij mechanicznie:

każdy route + jego loader/action → to twój roboczy katalog use case'ów
schemat DB + kto realnie zapisuje do których tabel
integracje zewnętrzne, webhooki, crony, maile, joby
gdzie faktycznie siedzi logika (loadery? serwisy? constrainty w DB? komponenty?)

Artefakt: tabela funkcja → dane → aktor → częstotliwość → krytyczność.

Uwaga: loader/action to nie jest 1:1 use case biznesowy. Szukaj intencji („zaplanuj trening", nie „PATCH /plan").

2. Event storming na tym, co jest

Big picture → process level → design level. Kluczowe: nie modelujesz od zera, używasz działającego systemu jako źródła prawdy, ale zapisujesz język biznesowy, nie techniczny. Miejsca, gdzie kod i język się rozjeżdżają, to najcenniejszy output tego kroku.

Szukaj: zdarzeń domenowych (czas przeszły), hot spotów, pivotal events, polityk, aktorów.

3. Klasyfikacja subdomen

Każdy zidentyfikowany obszar wrzuć do jednego z trzech koszyków:

core — przewaga konkurencyjna, złożone i zmienne reguły → pełne DDD taktyczne
supporting — specyficzne dla ciebie, ale proste → prosty model, transaction script
generic — auth, płatności, mailing, storage → kup/użyj gotowego, nie modeluj

To jest ten krok, który realizuje twój wymóg „nie wszystko jako złożona domena".

4. Heurystyka wyboru stylu per moduł

Kryteria oceny: liczba niezmienników, czy jest maszyna stanów, stosunek odczyt/zapis, wymóg audytu/historii, przewidywana zmienność.

Styl Kiedy
CRUD / active record brak niezmienników, dane wprowadzane i odczytywane, jedno źródło zapisu
Transaction script kilka reguł, proceduralnie, brak bogatego stanu
DDD taktyczne (agregaty, VO, domain events) ≥2–3 niezmienniki do ochrony, przejścia stanów, bogaty język biznesowy
CQRS (rozdzielone modele odczytu) asymetria read/write, wiele różnych widoków tych samych danych, raporty
Event sourcing realny wymóg audytu / „jak doszliśmy do tego stanu" / temporal queries

Zasada: zaczynasz od najprostszego, eskalujesz tylko na dowód — konkretna reguła, konkretny bug ze spójności, konkretne wymaganie. Nie „bo to core".

5. Bounded contexts + context map
   granica biegnie tam, gdzie to samo słowo zmienia znaczenie (User w billingu vs User w treningu)
   dla każdej pary określ typ relacji: ACL, conformist, customer-supplier, open host + published language
   dla każdej integracji określ formę: sync (HTTP) czy domain event (async)

Artefakt: diagram kontekstów + tabela integracji.

6. Kontrakty API — projektuj pod FE, ale nie przepisuj loaderów

Remixowy loader zwykle agreguje dane z kilku miejsc — to jest read model / BFF, a nie endpoint domenowy. Rozważ zostawienie cienkiej warstwy BFF (może zostać w Remixie) nad czystym API domenowym.

Rozstrzygnij wcześnie: kto trzyma sesję po rozbiciu (to zwykle pierwszy realny blocker), wersjonowanie, REST vs tRPC vs GraphQL.

7. Migracja — strangler fig
   na start wspólna baza, dopiero potem separacja schematów per kontekst
   Remix zostaje jako fasada i proxuje do nowego BE, moduł po module
   kolejność: zacznij od modułu z najmniejszą liczbą zależności (żeby przećwiczyć mechanikę) albo od najbardziej dokuczliwego (żeby mieć zwrot)
8. Decyzje przekrojowe

Transakcje ponad kontekstami (outbox + saga), spójność ostateczna i gdzie jest akceptowalna, autoryzacja, idempotencja, obserwowalność, wymuszanie granic w kodzie (dependency-cruiser / Nx module boundaries).

9. Output analizy

Context map, katalog use case'ów z przypisanym stylem architektonicznym, ubiquitous language per kontekst, kontrakty API, kolejność migracji i ADR-y na każdą nietrywialną decyzję (szczególnie na te, gdzie świadomie wybrałeś CRUD — inaczej ktoś to później „poprawi" na agregaty).

Jeśli chcesz, mogę przejść z tobą krok 1 i 3 na konkretnych route'ach twojej aplikacji — wtedy zamiast metodyki dostaniesz realny podział na konteksty.
