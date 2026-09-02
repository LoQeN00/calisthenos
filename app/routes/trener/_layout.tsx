import { NavLink, Outlet, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { UserMenu } from "~/components/user-menu";
import { requireUser } from "~/lib/api/auth";
import { db } from "~/lib/db/client";
import { countNewForTrainer } from "~/lib/feature-requests";
import { countTraineesOfTrainer } from "~/lib/trainees";
import { loadTrainerNavigation } from "~/lib/views";

export async function loader(args: LoaderFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainer" });

  // Jedno wywołanie na ekran. `trainees` i `ideas` zostają na bazie do swoich
  // obszarów — tam migracja to usunięcie funkcji i wzięcie pola z `nav`.
  const nav = await loadTrainerNavigation(api);
  const traineeCount = await countTraineesOfTrainer(db, user.id);
  const newIdeas = await countNewForTrainer(db, user.id);

  return {
    user,
    tails: {
      trainees: traineeCount,
      exercises: nav.activeExercises,
      // Bez zarchiwizowanych — tak liczy BE (`docs/03`: licznik powłoki liczy
      // jak zakładka „wszystkie" na liście). Do integracji liczył także archiwum.
      plans: nav.plans,
      ideas: newIdeas,
    },
  };
}

const NAV_ITEMS = [
  { to: "/trener", label: "Pulpit", end: true, icon: "Dashboard" as const, tailKey: null },
  {
    to: "/trener/podopieczni",
    label: "Podopieczni",
    end: false,
    icon: "Users" as const,
    tailKey: "trainees" as const,
  },
  {
    to: "/trener/biblioteka",
    label: "Biblioteka ćwiczeń",
    end: false,
    icon: "Library" as const,
    tailKey: "exercises" as const,
  },
  {
    to: "/trener/plany",
    label: "Plany",
    end: false,
    icon: "Plans" as const,
    tailKey: "plans" as const,
  },
  {
    to: "/trener/umiejetnosci",
    label: "Umiejętności",
    end: false,
    icon: "Trend" as const,
    tailKey: null,
  },
  {
    to: "/trener/konsultacje",
    label: "Konsultacje",
    end: false,
    icon: "Consult" as const,
    tailKey: null,
  },
  {
    to: "/trener/pomysly",
    label: "Pomysły",
    end: false,
    icon: "Sparkle" as const,
    tailKey: "ideas" as const,
  },
  {
    to: "/trener/integracje/stripe",
    label: "Płatności",
    end: false,
    icon: "Card" as const,
    tailKey: null,
  },
  {
    to: "/trener/integracje/google",
    label: "Integracje",
    end: false,
    icon: "Link" as const,
    tailKey: null,
  },
];

export default function TrenerLayout() {
  const { user, tails } = useLoaderData<typeof loader>();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <span className="topbar-eyebrow">TRENER</span>
        <div className="topbar-spacer" />
        <UserMenu displayName={user.displayName} />
      </header>
      <div className="layout">
        <nav className="sidenav">
          <div className="sidenav-section">Trener</div>
          {NAV_ITEMS.map((item) => {
            const Icon = Icons[item.icon];
            const tail = item.tailKey ? tails[item.tailKey] : null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
              >
                <Icon />
                <span>{item.label}</span>
                {tail != null && <span className="nav-tail">{tail}</span>}
              </NavLink>
            );
          })}
        </nav>
        <main className="main view-fade">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
