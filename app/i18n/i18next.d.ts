import type { PlResources } from "~/i18n/resources";

// Typowanie `t` — pl jako źródło prawdy kluczy i18next.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: PlResources;
  }
}
