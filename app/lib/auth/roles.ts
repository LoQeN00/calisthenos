export type Role = "trainer" | "trainee" | "brand_admin";

/** Jedyne źródło prawdy: dokąd kierujemy użytkownika po zalogowaniu / przy guardzie roli. */
export function defaultPathForRole(role: Role): string {
  switch (role) {
    case "trainer":
      return "/trener";
    case "trainee":
      return "/podopieczny";
    case "brand_admin":
      return "/marka";
  }
}
