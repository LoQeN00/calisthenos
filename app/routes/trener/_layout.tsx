import { and, count, eq } from "drizzle-orm";
import {
  Form,
  NavLink,
  Outlet,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });

  const [traineeCountRow] = await db
    .select({ c: count() })
    .from(schema.users)
    .where(and(eq(schema.users.trainerId, user.id), eq(schema.users.role, "trainee")));
  const [exerciseCountRow] = await db
    .select({ c: count() })
    .from(schema.exercises)
    .where(eq(schema.exercises.trainerId, user.id));
  const [planCountRow] = await db
    .select({ c: count() })
    .from(schema.plans)
    .where(eq(schema.plans.trainerId, user.id));

  return {
    user,
    tails: {
      trainees: Number(traineeCountRow?.c ?? 0),
      exercises: Number(exerciseCountRow?.c ?? 0),
      plans: Number(planCountRow?.c ?? 0),
    },
  };
}

const NAV_ITEMS = [
  { to: "/trener", label: "Pulpit", end: true, icon: "Dashboard" as const, tailKey: null },
  { to: "/trener/podopieczni", label: "Podopieczni", end: false, icon: "Users" as const, tailKey: "trainees" as const },
  { to: "/trener/biblioteka", label: "Biblioteka ćwiczeń", end: false, icon: "Library" as const, tailKey: "exercises" as const },
  { to: "/trener/plany", label: "Plany", end: false, icon: "Plans" as const, tailKey: "plans" as const },
];

export default function TrenerLayout() {
  const { user, tails } = useLoaderData<typeof loader>();
  const initials = initialsOf(user.displayName);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <span className="topbar-eyebrow">TRENER · {user.displayName.toUpperCase()}</span>
        <div className="topbar-spacer" />
        <div className="userchip">
          <span className="avatar">{initials}</span>
          <span>{user.displayName}</span>
        </div>
        <Form method="post" action="/wyloguj">
          <button type="submit" className="btn btn-sm">
            Wyloguj
          </button>
        </Form>
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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}
