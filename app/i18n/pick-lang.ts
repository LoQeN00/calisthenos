import { FALLBACK_LANG, type Lang, localeToLang } from "./config";

export interface PickLangInput {
  regionLocale?: string | null;
  inviteTrainerRegionLocale?: string | null;
  acceptLanguage?: string | null;
}

/** Pierwszy wspierany język z nagłówka Accept-Language, albo null. */
function fromAcceptLanguage(header: string | null | undefined): Lang | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    const lang = localeToLang(tag);
    if (lang) return lang;
  }
  return null;
}

export function pickLang(input: PickLangInput): Lang {
  return (
    localeToLang(input.regionLocale) ??
    localeToLang(input.inviteTrainerRegionLocale) ??
    fromAcceptLanguage(input.acceptLanguage) ??
    FALLBACK_LANG
  );
}
