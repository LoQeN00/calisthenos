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
      route(
        "podopieczni/:traineeId/sylwetka",
        "routes/trener/podopieczni.$traineeId.sylwetka.tsx",
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
      route("sylwetka", "routes/podopieczny/sylwetka.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
