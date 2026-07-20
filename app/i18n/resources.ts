import plCommon from "~/locales/pl/common.json";
import plAuth from "~/locales/pl/auth.json";
import plKonsultacje from "~/locales/pl/konsultacje.json";
import plPlatnosci from "~/locales/pl/platnosci.json";
import plPodopieczny from "~/locales/pl/podopieczny.json";
import plTrener from "~/locales/pl/trener.json";
import plTrenerPlany from "~/locales/pl/trenerPlany.json";
import plTrenerPodopieczni from "~/locales/pl/trenerPodopieczni.json";
import plTrenerRozwoj from "~/locales/pl/trenerRozwoj.json";
import plTrenerKonsultacje from "~/locales/pl/trenerKonsultacje.json";
import plMarka from "~/locales/pl/marka.json";
import frCommon from "~/locales/fr/common.json";
import frAuth from "~/locales/fr/auth.json";
import frKonsultacje from "~/locales/fr/konsultacje.json";
import frPlatnosci from "~/locales/fr/platnosci.json";
import frPodopieczny from "~/locales/fr/podopieczny.json";
import frTrener from "~/locales/fr/trener.json";
import frTrenerPlany from "~/locales/fr/trenerPlany.json";
import frTrenerPodopieczni from "~/locales/fr/trenerPodopieczni.json";
import frTrenerRozwoj from "~/locales/fr/trenerRozwoj.json";
import frTrenerKonsultacje from "~/locales/fr/trenerKonsultacje.json";
import frMarka from "~/locales/fr/marka.json";

export const resources = {
  pl: {
    common: plCommon,
    auth: plAuth,
    konsultacje: plKonsultacje,
    platnosci: plPlatnosci,
    podopieczny: plPodopieczny,
    trener: plTrener,
    trenerPlany: plTrenerPlany,
    trenerPodopieczni: plTrenerPodopieczni,
    trenerRozwoj: plTrenerRozwoj,
    trenerKonsultacje: plTrenerKonsultacje,
    marka: plMarka,
  },
  fr: {
    common: frCommon,
    auth: frAuth,
    konsultacje: frKonsultacje,
    platnosci: frPlatnosci,
    podopieczny: frPodopieczny,
    trener: frTrener,
    trenerPlany: frTrenerPlany,
    trenerPodopieczni: frTrenerPodopieczni,
    trenerRozwoj: frTrenerRozwoj,
    trenerKonsultacje: frTrenerKonsultacje,
    marka: frMarka,
  },
} as const;

export type PlResources = (typeof resources)["pl"];
