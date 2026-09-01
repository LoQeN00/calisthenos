import { data } from "react-router";
import { errorMeta, logger } from "~/lib/logger";

export interface WindowState {
  count: number;
  windowStartMs: number;
}

export interface HitResult {
  state: WindowState;
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Czysta logika fixed-window (bez Date.now — `nowMs` wstrzykiwane). Nowe okno gdy
 * brak stanu lub poprzednie wygasło; inaczej inkrement. Okno NIE przesuwa się przy
 * zablokowanych próbach (fixed, nie sliding).
 */
export function fixedWindowHit(
  prev: WindowState | undefined,
  nowMs: number,
  limit: number,
  windowMs: number,
): HitResult {
  if (!prev || nowMs - prev.windowStartMs >= windowMs) {
    return { state: { count: 1, windowStartMs: nowMs }, allowed: true, retryAfterSec: 0 };
  }
  // Cap na limit+1 — po przekroczeniu nie ma sensu dalej zliczać (decyzja zależy
  // tylko od `count <= limit`); chroni przed nieograniczonym wzrostem przy floodzie.
  const count = Math.min(prev.count + 1, limit + 1);
  const allowed = count <= limit;
  const retryAfterSec = allowed ? 0 : Math.ceil((prev.windowStartMs + windowMs - nowMs) / 1000);
  return { state: { count, windowStartMs: prev.windowStartMs }, allowed, retryAfterSec };
}

/**
 * Adres klienta z `X-Forwarded-For` (Railway ustawia zaufany XFF za swoim proxy —
 * bierzemy leftmost wpis = oryginalny klient). Brak nagłówka → "unknown" (wspólny
 * bucket; w dev/bez proxy). Jeśli deployment przestanie być za zaufanym proxy,
 * tę funkcję trzeba zrewidować (XFF jest wtedy podrabialny).
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  const first = xff.split(",")[0]?.trim();
  return first || "unknown";
}

export interface RateLimitStore {
  hit(key: string, limit: number, windowMs: number): HitResult;
  reset(key: string): void;
}

// Najdłuższe skonfigurowane okno — używane do sweepu (konserwatywnie; przedwczesny
// sweep tylko „wybacza" wpis, nigdy nie blokuje dłużej).
const MAX_WINDOW_MS = 15 * 60_000;
const DEFAULT_SWEEP_THRESHOLD = 5000;

export class InMemoryRateLimitStore implements RateLimitStore {
  private map = new Map<string, WindowState>();

  constructor(
    private now: () => number = () => Date.now(),
    private sweepThreshold: number = DEFAULT_SWEEP_THRESHOLD,
  ) {}

  get size(): number {
    return this.map.size;
  }

  hit(key: string, limit: number, windowMs: number): HitResult {
    const nowMs = this.now();
    if (this.map.size > this.sweepThreshold) this.sweep(nowMs);
    const result = fixedWindowHit(this.map.get(key), nowMs, limit, windowMs);
    this.map.set(key, result.state);
    return result;
  }

  reset(key: string): void {
    this.map.delete(key);
  }

  private sweep(nowMs: number): void {
    for (const [k, v] of this.map) {
      if (nowMs - v.windowStartMs >= MAX_WINDOW_MS) this.map.delete(k);
    }
  }
}

/**
 * Został jeden limit. `login` i `invite` przeszły do BE w kroku 2 Etapu 2 —
 * i są tam **lepiej kluczowane**: po znormalizowanym adresie e-mail z ciała
 * żądania, czyli po koncie, które ktoś atakuje, a nie po adresie IP, który
 * podopieczni dzielą przez NAT, a jeden użytkownik zmienia przełączając wifi
 * na LTE. Trzymanie kopii po tej stronie znaczyłoby tę samą ochronę w dwóch
 * miejscach, z dwoma różnymi kluczami i dwoma licznikami nieświadomymi siebie.
 *
 * `upload` zostaje do kroku 4, w którym wysyłka plików przechodzi na BE.
 */
export const RATE_LIMITS = {
  // Hojnie: ciężka sesja treningowa to ~20 nagrań, więc 100 nie przeszkodzi nikomu
  // realnemu, a ogranicza zapychanie wolumenu. Kluczowane po użytkowniku (patrz `key`).
  upload: { bucket: "upload", limit: 100, windowMs: 15 * 60_000 },
} as const;

// Singleton procesu (in-memory). Świadomie resetuje się przy redeployu — patrz spec.
const store: RateLimitStore = new InMemoryRateLimitStore();

/**
 * Zwraca `retryAfterSec` gdy żądanie ma być zablokowane, inaczej `null`.
 * FAIL-OPEN: każdy błąd wewnętrzny → `null` (+log), by usterka limitera nie
 * zablokowała logowania wszystkim.
 *
 * `opts.key` podmienia podmiot limitu (domyślnie adres klienta). Dla endpointów
 * UWIERZYTELNIONYCH właściwym podmiotem jest użytkownik, nie IP: kilku podopiecznych
 * może dzielić NAT (blokowaliby się nawzajem), a jeden podopieczny może przełączać
 * wifi↔LTE (omijałby limit).
 */
export function enforceRateLimit(
  request: Request,
  opts: { bucket: string; limit: number; windowMs: number; key?: string },
): number | null {
  try {
    const key = `${opts.bucket}:${opts.key ?? clientIp(request)}`;
    const r = store.hit(key, opts.limit, opts.windowMs);
    return r.allowed ? null : r.retryAfterSec;
  } catch (err) {
    logger.error("rate_limit.enforce_failed", errorMeta(err));
    return null;
  }
}

/** Czyści licznik klucza (po udanej akcji). Best-effort. */
export function resetRateLimit(bucket: string, request: Request): void {
  try {
    store.reset(`${bucket}:${clientIp(request)}`);
  } catch {
    // best-effort
  }
}

/**
 * Wynik akcji RR7 dla przekroczenia: HTTP 429 + Retry-After (s) + komunikat PL w
 * kształcie `{ error }` (czytany przez useActionData). `data()` z 4xx NIE wyzwala
 * ErrorBoundary — route renderuje się normalnie z actionData.error.
 */
export function rateLimited(retryAfterSec: number) {
  const mins = Math.max(1, Math.ceil(retryAfterSec / 60));
  return data(
    { error: `Za dużo prób. Spróbuj ponownie za ${mins} min.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
