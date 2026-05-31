import { type RouteConfig, index, route, layout, prefix } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("wyloguj", "routes/wyloguj.tsx"),
  route("zaproszenie/:token", "routes/zaproszenie.$token.tsx"),
  route("files/:fileId", "routes/files.$fileId.tsx"),
  ...prefix("trener", [
    layout("routes/trener/_layout.tsx", [
      index("routes/trener/_index.tsx"),
      route("biblioteka", "routes/trener/biblioteka._index.tsx"),
      route("biblioteka/nowe", "routes/trener/biblioteka.nowe.tsx"),
      route("biblioteka/:exerciseId", "routes/trener/biblioteka.$exerciseId.tsx"),
      route("plany", "routes/trener/plany._index.tsx"),
      route("plany/nowy", "routes/trener/plany.nowy.tsx"),
      route("plany/:planId", "routes/trener/plany.$planId.tsx"),
      route("podopieczni", "routes/trener/podopieczni._index.tsx"),
      route("podopieczni/:traineeId", "routes/trener/podopieczni.$traineeId.tsx"),
      route(
        "podopieczni/:traineeId/log/:logId",
        "routes/trener/podopieczni.$traineeId.log.$logId.tsx",
      ),
      route("podopieczni/:traineeId/sylwetka", "routes/trener/podopieczni.$traineeId.sylwetka.tsx"),
      route(
        "podopieczni/:traineeId/statystyki",
        "routes/trener/podopieczni.$traineeId.statystyki.tsx",
      ),
      route(
        "podopieczni/:traineeId/progresja",
        "routes/trener/podopieczni.$traineeId.progresja._index.tsx",
      ),
      route(
        "podopieczni/:traineeId/progresja/:exerciseId",
        "routes/trener/podopieczni.$traineeId.progresja.$exerciseId.tsx",
      ),
      route(
        "podopieczni/:traineeId/progresja/porownanie",
        "routes/trener/podopieczni.$traineeId.progresja.porownanie.tsx",
      ),
      route(
        "podopieczni/:traineeId/konsultacje",
        "routes/trener/podopieczni.$traineeId.konsultacje._index.tsx",
      ),
      route(
        "podopieczni/:traineeId/konsultacje/nowa",
        "routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx",
      ),
      route(
        "podopieczni/:traineeId/konsultacje/:konsultacjaId",
        "routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx",
      ),
    ]),
  ]),
  ...prefix("podopieczny", [
    layout("routes/podopieczny/_layout.tsx", [
      index("routes/podopieczny/_index.tsx"),
      route("sesje", "routes/podopieczny/sesje._index.tsx"),
      route("sesje/:sessionId", "routes/podopieczny/sesje.$sessionId.tsx"),
      route("loguj/:sessionId", "routes/podopieczny/loguj.$sessionId.tsx"),
      route("historia", "routes/podopieczny/historia._index.tsx"),
      route("historia/:logId", "routes/podopieczny/historia.$logId.tsx"),
      route("statystyki", "routes/podopieczny/statystyki.tsx"),
      route("progresja", "routes/podopieczny/progresja._index.tsx"),
      route("progresja/:exerciseId", "routes/podopieczny/progresja.$exerciseId.tsx"),
      route("progresja/porownanie", "routes/podopieczny/progresja.porownanie.tsx"),
      route("sylwetka", "routes/podopieczny/sylwetka.tsx"),
      route("konsultacje", "routes/podopieczny/konsultacje._index.tsx"),
      route("konsultacje/:konsultacjaId", "routes/podopieczny/konsultacje.$konsultacjaId.tsx"),
    ]),
    // Wrapped lives OUTSIDE the sidenav layout so it can render full-screen.
    route("wrapped/:ym", "routes/podopieczny/wrapped.$ym.tsx"),
  ]),
] satisfies RouteConfig;
