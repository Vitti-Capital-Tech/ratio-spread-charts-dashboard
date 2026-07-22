import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LOG = 200;

async function getUserId(req) {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user?.id || null;
}

// GET /api/alert-history -> { logs: [{ id, time, type, msg }] } (newest first)
export async function GET(req) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await query(
    `SELECT id, created_at, type, message FROM alert_history
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, MAX_LOG]
  );
  return NextResponse.json({
    logs: rows.map((r) => ({ id: r.id, time: Number(r.created_at), type: r.type, msg: r.message })),
  });
}

// POST /api/alert-history  body: { id, createdAt, type, message }
export async function POST(req) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { id, createdAt, type, message } = body || {};
  if (!id || !message) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  await query(
    `INSERT INTO alert_history (id, user_id, created_at, type, message)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
    [id, userId, Math.floor(Number(createdAt) || Date.now()), type || "alert", message]
  );

  // Retention: keep only the newest MAX_LOG entries for this user.
  await query(
    `DELETE FROM alert_history
     WHERE user_id = $1 AND created_at < (
       SELECT MIN(created_at) FROM (
         SELECT created_at FROM alert_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
       ) keep
     )`,
    [userId, MAX_LOG]
  );

  return NextResponse.json({ ok: true });
}

// DELETE /api/alert-history -> clears the user's log
export async function DELETE(req) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await query(`DELETE FROM alert_history WHERE user_id = $1`, [userId]);
  return NextResponse.json({ ok: true });
}
