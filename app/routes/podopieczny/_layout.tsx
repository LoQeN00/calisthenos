import { and, count, eq } from "drizzle-orm";
import { NavLink, Outlet, redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { UserMenu } from "~/components/user-menu";
import { requireUser } from "~/lib/auth";
import { countPendingForTrainee } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { stripeApiConfigured } from "~/lib/env";
import { hasAppAccess, paymentRequired } from "~/lib/stripe/access";
import { getConnectionRow } from "~/lib/stripe/connections";
import { getSubscriptionForPair } from "~/lib/stripe/subscriptions";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });

  const [logCountRow] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, user.id));
  const [photoCountRow] = await db
    .select({ c: count() })
    .from(schema.bodyPhotos)
    .where(eq(schema.bodyPhotos.traineeId, user.id));

  // Sessions count = sessions in the trainee's active plan (if any).
  const activePlan = await db
    .select({ id: schema.plans.id })
    .from(schema.plans)
    .where(and(eq(schema.plans.traineeId, user.id), eq(schema.plans.status, "active")))
    .limit(1);
  let sessionsCount = 0;
  if (activePlan[0]) {
    const [row] = await db
      .select({ c: count() })
      .from(schema.planSessions)
      .where(eq(schema.planSessions.planId, activePlan[0].id));
    sessionsCount = Number(row?.c ?? 0);
  }

  const pending = await countPendingForTrainee(db, user.id);

  // Payment gating + badge: fetch the pair's subscription + the trainer's Stripe
  // connection once, then reuse for both the access gate and the nav badge.
  let paymentsBadge = 0;
  if (user.trainerId) {
    const sub = await getSubscriptionForPair(db, user.trainerId, user.id);
    const conn = await getConnectionRow(db, user.trainerId);

    // Gate: only when payment is realistically possible (Stripe configured,
    // trainer charges enabled, price set). Then require an access-granting status.
    const required = paymentRequired({
      stripeConfigured: stripeApiConfigured(),
      chargesEnabled: Boolean(conn?.chargesEnabled),
      hasPrice: Boolean(sub?.stripePriceId),
    });
    if (!hasAppAccess({ paymentRequired: required, status: sub?.status ?? null })) {
      throw redirect("/podopieczny/aktywuj");
    }

    // Badge: flag when subscription needs attention (past_due, unpaid, or no
    // subscription row yet but trainer has set a price — i.e. status 'none').
    const needsAttention =
      sub?.status === "past_due" ||
      sub?.status === "unpaid" ||
      (sub?.status === "none" && sub.stripePriceId != null);
    if (needsAttention) paymentsBadge = 1;
  }

  return {
    user,
    tails: {
      sessions: sessionsCount,
      history: Number(logCountRow?.c ?? 0),
      photos: Number(photoCountRow?.c ?? 0),
      consultations: pending,
      payments: paymentsBadge,
    },
  };
}

const NAV_ITEMS = [
  { to: "/podopieczny", label: "Mój plan", end: true, icon: "Dashboard" as const, tailKey: null },
  {
    to: "/podopieczny/sesje",
    label: "Sesje",
    end: false,
    icon: "Plans" as const,
    tailKey: "sessions" as const,
  },
  {
    to: "/podopieczny/historia",
    label: "Historia",
    end: false,
    icon: "History" as const,
    tailKey: "history" as const,
  },
  {
    to: "/podopieczny/rozwoj",
    label: "Rozwój",
    end: false,
    icon: "Trend" as const,
    tailKey: null,
  },
  {
    to: "/podopieczny/sylwetka",
    label: "Sylwetka",
    end: false,
    icon: "Camera" as const,
    tailKey: "photos" as const,
  },
  {
    to: "/podopieczny/konsultacje",
    label: "Konsultacje",
    end: false,
    icon: "Consult" as const,
    tailKey: "consultations" as const,
  },
  {
    to: "/podopieczny/platnosci",
    label: "Płatności",
    end: false,
    icon: "Card" as const,
    tailKey: "payments" as const,
  },
];

export default function PodopiecznyLayout() {
  const { user, tails } = useLoaderData<typeof loader>();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <span className="topbar-eyebrow">PODOPIECZNY</span>
        <div className="topbar-spacer" />
        <UserMenu displayName={user.displayName} />
      </header>
      <div className="layout">
        <nav className="sidenav nav-tabs-bottom">
          <div className="sidenav-section">Podopieczny</div>
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
