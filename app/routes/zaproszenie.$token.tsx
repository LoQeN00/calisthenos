import {
  redirect,
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { buildSetCookie, consumeInvite, createSession, hashPassword, hashToken } from "~/lib/auth";

const AcceptSchema = z.object({
  displayName: z.string().min(1).max(80),
  password: z.string().min(8).max(1024),
});

export async function loader(args: LoaderFunctionArgs) {
  const token = args.params.token ?? "";
  const hash = hashToken(token);
  const rows = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, hash))
    .limit(1);
  const invite = rows[0];
  // Treat unknown / consumed / expired invites identically as 404 so a probe can't
  // distinguish "wrong token" from "right token but used/expired".
  if (!invite || invite.consumedAt || invite.expiresAt.getTime() < Date.now()) {
    throw new Response("invite not found", { status: 404 });
  }
  return { displayName: invite.displayName, emailHint: invite.email };
}

export async function action(args: ActionFunctionArgs) {
  const token = args.params.token ?? "";
  const fd = await args.request.formData();
  const parsed = AcceptSchema.safeParse({
    displayName: fd.get("displayName"),
    password: fd.get("password"),
  });
  if (!parsed.success) {
    return { error: "Sprawdź pola formularza." };
  }

  // Email is authoritative from the invite — the trainer sets it, the trainee
  // accepts it. Don't trust anything the form posted under that name.
  const inviteRows = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, hashToken(token)))
    .limit(1);
  const invite = inviteRows[0];
  if (!invite || invite.consumedAt || invite.expiresAt.getTime() < Date.now()) {
    return { error: "Zaproszenie nieprawidłowe." };
  }
  if (!invite.email) {
    return { error: "To zaproszenie nie ma przypisanego emaila — poproś trenera o nowe." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  let user: schema.User;
  try {
    const result = await consumeInvite(db, {
      token,
      chosenEmail: invite.email,
      chosenDisplayName: parsed.data.displayName,
      newPasswordHash: passwordHash,
    });
    user = result.user;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (/expired/i.test(msg)) return { error: "Zaproszenie wygasło." };
    if (/used/i.test(msg)) return { error: "Zaproszenie już użyte." };
    return { error: "Zaproszenie nieprawidłowe." };
  }
  const { id, expiresAt } = await createSession(db, {
    userId: user.id,
    userAgentHint: args.request.headers.get("user-agent"),
  });
  return redirect(user.role === "trainer" ? "/trener" : "/podopieczny", {
    headers: { "Set-Cookie": buildSetCookie(id, expiresAt) },
  });
}

export default function InviteAccept() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Zaproszenie
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Witaj, {loaderData.displayName}.</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          Trener Cię zaprosił. Ustaw email i hasło.
        </p>
        <Form method="post" style={{ display: "grid", gap: 14 }}>
          <div className="field">
            <label htmlFor="inv-email">Email</label>
            <input
              id="inv-email"
              name="email"
              type="email"
              value={loaderData.emailHint ?? ""}
              readOnly
              autoComplete="email"
              className="input"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            />
            <div className="text-xs muted" style={{ marginTop: 4 }}>
              Email ustawia trener — nie da się go tu zmienić.
            </div>
          </div>
          <div className="field">
            <label htmlFor="inv-name">Nazwa wyświetlana</label>
            <input
              id="inv-name"
              name="displayName"
              type="text"
              required
              defaultValue={loaderData.displayName}
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="inv-password">Hasło (min. 8 znaków)</label>
            <input
              id="inv-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
            />
          </div>
          {actionData && "error" in actionData && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
              {actionData.error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: 4 }}>
            Załóż konto
          </button>
        </Form>
      </div>
    </main>
  );
}
