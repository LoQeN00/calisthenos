import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { resources } from "~/i18n/resources";
import { DEFAULT_NS, NAMESPACES } from "~/i18n/config";

async function hydrate() {
  const lng = document.documentElement.lang || "pl";
  await i18next.use(initReactI18next).init({
    lng,
    resources,
    fallbackLng: "pl",
    defaultNS: DEFAULT_NS,
    ns: [...NAMESPACES],
    interpolation: { escapeValue: false },
  });
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <I18nextProvider i18n={i18next}>
          <HydratedRouter />
        </I18nextProvider>
      </StrictMode>,
    );
  });
}
hydrate();
