# Płatności subskrypcyjne — research best practices (deep research)

> Data: 2026-06-06. Źródło: workflow `deep-research` (5 kątów, 23 źródła, 103
> twierdzenia → 25 zweryfikowanych adwersaryjnie, **25/25 potwierdzonych, 0
> obalonych**). Podstawa redesignu:
> [`specs/2026-06-06-platnosci-redesign-design.md`](specs/2026-06-06-platnosci-redesign-design.md).

## Wniosek nadrzędny

Model „klient inicjuje, karta z góry" jest **standardem branżowym** (Everfit,
Trainerize). Problem kalisthenos nie leży w „kliknięciu Subskrybuj", lecz w
**frameingu/brandingu** i brakujących elementach cyklu życia (disclosure/zgoda,
pauza, dunning, jawność). Architektura (Express + destination charges + Checkout)
jest **kanonicznie poprawna** — nie przebudowujemy, szlifujemy.

## Zweryfikowane ustalenia (z cytatami)

1. **Onboarding (wysoka):** liderzy mają klienta inicjującego zakup ze strony
   pakietu trenera; karta zbierana z góry; **trial też wymaga karty**.
   Źródła: help.everfit.io/articles/5719215, /7269312.
2. **Disclosure + zgoda na checkoutcie (wysoka):** jawny blok „auto-odnawianie +
   jak anulować" + kwota początkowa / kwota odnowienia / data odnowienia +
   elektroniczna zgoda na obciążanie. Mapuje się na wymogi EU. Źródło:
   help.everfit.io/articles/5719215.
3. **Dunning (wysoka):** Stripe Smart Retries — **8 prób w 2 tygodnie** (AI dobiera
   czas), stan końcowy do wyboru: `cancel` / `unpaid` / `past_due`. Lepsze niż
   sztywny 3/5-dniowy harmonogram Trainerize → auto-dezaktywacja. Źródła:
   docs.stripe.com/billing/revenue-recovery/smart-retries; help.trainerize.com.
4. **Pauza = luka branżowa (wysoka):** Trainerize **nie ma natywnej pauzy** (tylko
   obejścia: anuluj-i-sprzedaj, kupon -100%). Rekomendacja: prawdziwa pauza przez
   Stripe `pause_collection`. Źródło: help.trainerize.com/articles/26557639320852.
   Uwaga techniczna (docs.stripe.com/api): `pause_collection` **nie** zmienia
   `subscription.status`; opcje `keep_as_draft`/`mark_uncollectible`/`void`.
5. **Marketplace / MoR (wysoka):** przy destination charges bez `on_behalf_of`
   **platforma jest merchant-of-record** (deskryptor, branding e-maili/faktur/
   Portalu = platforma; platforma ponosi prowizje/zwroty/chargebacki). Źródła:
   docs.stripe.com/connect/{charges,destination-charges,subscriptions,merchant-of-record}.
6. **`on_behalf_of` (wysoka):** ustawienie go na konto trenera przełącza branding
   i deskryptor na trenera — największa dźwignia „osobistości". Ale przenosi MoR na
   trenera (spory/podatki). **Decyzja kalisthenos: NIE ustawiamy — platforma
   zostaje MoR** (prościej prawnie). Źródła: docs.stripe.com/connect/{subscriptions,charges,statement-descriptors}.
7. **Opłaty (wysoka):** przy destination charges platforma **zawsze** płaci
   prowizje/zwroty/chargebacki; z `application_fee=0` absorbujemy cały koszt.
   Źródła: docs.stripe.com/connect/{integration-recommendations,subscriptions}.
8. **Architektura potwierdzona (wysoka):** Express + destination + Checkout to
   rekomendacja Stripe dla marketplace z subskrypcjami. Źródła:
   docs.stripe.com/connect/{subscriptions,charges}; .../strong-customer-authentication/connect-platforms.
9. **⚖️ SCA — wymóg prawny EU (wysoka):** pierwsze obciążenie musi przejść 3DS;
   zapis karty w onboardingu **musi** wyzwolić uwierzytelnienie (SetupIntent/3DS),
   nie „cichy" zapis — to uwierzytelnienie jest zgodą zwalniającą odnowienia.
   Checkout robi to natywnie. Źródła: docs.stripe.com/strong-customer-authentication/connect-platforms;
   support.stripe.com (SCA exemptions).
10. **Odnowienia SCA-exempt (2-1, mocno korroborowane):** stała kwota + stały
    interwał → tylko pierwsze obciążenie przez 3DS; **zmiana kwoty/proracja
    prawdopodobnie ponownie wyzwala 3DS**. → zmiana ceny od następnego odnowienia,
    z wyprzedzającym powiadomieniem. Źródła: support.stripe.com; docs.stripe.com/payments/3d-secure/...exemptions.

## Czego research NIE rozstrzygnął (do prawnika/księgowej)

- Obowiązki **VAT i e-faktur w PL** dla platformy jako MoR (i wpływ `on_behalf_of`).
- Wymagane prawnie **powiadomienia o nadchodzącym obciążeniu** w EU/PL (czas/treść).
- Specyfika TrueCoach/TrainHeroic/PT Distinction/Kahunas (niepotwierdzona).

## Zastrzeżenia źródłowe

Strony Trainerize pobrane przez cache wyszukiwarki (403 anti-bot przy bezpośrednim
fetchu) — cytaty zgodne między wyszukiwaniami, ale nierenderowane u źródła. Stripe
oznacza Express/Custom jako „legacy" wobec nowych v2 Accounts — nie podważa
bieżących rekomendacji, ale do obserwacji na przyszłość.
