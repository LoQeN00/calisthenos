import { describe, expect, it } from "vitest";
import { createApiClient } from "../api/client";
import { ApiError } from "../api/errors";
import { createInvite, InviteError } from "./invite";

// `Promise<Response>` w sygnaturze jest konieczne: przypadki niżej czytają ciało
// żądania (`await req.json()`), więc reguła bywa funkcją asynchroniczną.
function klient(reguly: (req: Request) => Response | Promise<Response>) {
  return createApiClient({
    baseUrl: "http://be.test",
    getToken: () => "T",
    fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
  });
}

function json(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Koperta błędu BE: `{ error: { code, message, details } }` — dokładnie to, co
// rozbiera `parseApiError` (idiom z `plans.test.ts`).
function odmowa(status: number, code: string, message: string, details?: unknown): Response {
  return json(status, { error: { code, message, details } });
}

const UTWORZONE = {
  token: "tok-surowy",
  url: "http://app.test/join/tok-surowy",
  expiresAt: "2026-09-17T10:00:00.000Z",
};

describe("createInvite — zaproszenie przez kontrakt", () => {
  it("to `POST /v1/invites` z ciałem: nazwa, e-mail, kwota i formularz — bez `trainerId`", async () => {
    // Trener wynika z tokenu. `trainerId` w ciele byłoby polem spoza DTO, czyli
    // `400` (forbidNonWhitelisted). Szablon formularza jedzie w TYM SAMYM
    // żądaniu — atomowość „zaproszenie + formularz" jest teraz sprawą BE.
    let sciezka = "";
    let metoda = "";
    let cialo: unknown;
    const api = klient(async (req) => {
      sciezka = new URL(req.url).pathname;
      metoda = req.method;
      cialo = await req.json();
      return json(201, UTWORZONE);
    });

    await createInvite(api, {
      displayName: "Nowy Podopieczny",
      email: "nowy@example.com",
      monthlyAmountGrosze: 20000,
      onboardingForm: { exerciseIds: ["e-1", "e-2"], note: "Wykonaj na świeżo." },
    });

    expect(metoda).toBe("POST");
    expect(sciezka).toBe("/v1/invites");
    expect(cialo).toEqual({
      displayName: "Nowy Podopieczny",
      email: "nowy@example.com",
      monthlyAmountGrosze: 20000,
      onboardingForm: { exerciseIds: ["e-1", "e-2"], note: "Wykonaj na świeżo." },
    });
  });

  it("bez formularza i bez kwoty oba pola jadą jako `null`, nie znikają", async () => {
    // DTO dopuszcza `null` w obu; brak klucza i `null` znaczą to samo, ale jawny
    // `null` pilnuje, żeby trasa nie mogła podać `undefined` przez przeoczenie.
    let cialo: unknown;
    const api = klient(async (req) => {
      cialo = await req.json();
      return json(201, UTWORZONE);
    });

    await createInvite(api, {
      displayName: "Nowy Podopieczny",
      email: "nowy@example.com",
      monthlyAmountGrosze: null,
      onboardingForm: null,
    });

    expect(cialo).toEqual({
      displayName: "Nowy Podopieczny",
      email: "nowy@example.com",
      monthlyAmountGrosze: null,
      onboardingForm: null,
    });
  });

  it("oddaje token, gotowy odnośnik i datę wygaśnięcia z kontraktu, nietknięte", async () => {
    // Surowy token opuszcza serwer wyłącznie tutaj; to trasa decyduje, z czego
    // składa odnośnik (dziś z `token`, bo FE serwuje `/zaproszenie/:token`,
    // a `url` z BE wskazuje `/join/{token}` — luka L S2-1).
    const api = klient(() => json(201, UTWORZONE));

    const wynik = await createInvite(api, {
      displayName: "Nowy Podopieczny",
      email: null,
      monthlyAmountGrosze: null,
      onboardingForm: null,
    });

    expect(wynik).toEqual(UTWORZONE);
  });

  it("`404` (cudze albo zarchiwizowane ćwiczenie w szablonie) i `409` (oczekujący formularz) idą do modalu jako InviteError", async () => {
    // BE sprawdza ćwiczenia PRZED wstawieniem czegokolwiek, więc po odmowie nie
    // ma zaproszenia do sprzątania — tak jak dawny rollback transakcji.
    const cudze = klient(() =>
      odmowa(404, "RESOURCE_NOT_FOUND", "Nie znaleziono zasobu.", {
        resource: "exercise",
        id: "e-x",
      }),
    );
    const oczekujacy = klient(() =>
      odmowa(
        409,
        "ONBOARDING_FORM_ALREADY_PENDING",
        "Ten podopieczny ma już oczekujący formularz startowy — nie można doczepić kolejnego.",
      ),
    );
    const wejscie = {
      displayName: "Nowy Podopieczny",
      email: "nowy@example.com",
      monthlyAmountGrosze: null,
      onboardingForm: { exerciseIds: ["e-x"], note: null },
    };

    const bladCwiczenia = await createInvite(cudze, wejscie).catch((e) => e);
    const bladFormularza = await createInvite(oczekujacy, wejscie).catch((e) => e);

    expect(bladCwiczenia).toBeInstanceOf(InviteError);
    expect((bladCwiczenia as InviteError).userMessage).toBe("Nie znaleziono zasobu.");
    expect(bladFormularza).toBeInstanceOf(InviteError);
    expect((bladFormularza as InviteError).userMessage).toContain("oczekujący formularz");
  });

  it("`500` przechodzi jako ApiError — awaria BE ma zostać awarią", async () => {
    const api = klient(() => odmowa(500, "INTERNAL", "Coś poszło nie tak."));

    const blad = await createInvite(api, {
      displayName: "Nowy Podopieczny",
      email: null,
      monthlyAmountGrosze: null,
      onboardingForm: null,
    }).catch((e) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect(blad).not.toBeInstanceOf(InviteError);
  });
});
