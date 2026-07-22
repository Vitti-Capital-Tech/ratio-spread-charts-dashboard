import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_POINTS = 800;

async function getUserId(req) {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user?.id || null;
}

// GET /api/iv-history?key=<strategyKey> -> { points: [{ t, callIv, putIv }] }
export async function GET(req) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  const { rows } = await query(
    `SELECT t, call_iv, put_iv FROM iv_history
     WHERE user_id = $1 AND strategy_key = $2
     ORDER BY t ASC LIMIT $3`,
    [userId, key, MAX_POINTS]
  );
  return NextResponse.json({
    points: rows.map((r) => ({ t: Number(r.t), callIv: r.call_iv, putIv: r.put_iv })),
  });
}

// POST /api/iv-history  body: { key, points: [{ t, callIv, putIv }] }
export async function POST(req) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const key = body?.key;
  const points = Array.isArray(body?.points) ? body.points : [];
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  if (!points.length) return NextResponse.json({ ok: true, written: 0 });

  const batch = points.slice(-MAX_POINTS).filter((p) => p && Number.isFinite(Number(p.t)));
  if (!batch.length) return NextResponse.json({ ok: true, written: 0 });

  const values = [];
  const params = [];
  batch.forEach((p, i) => {
    const b = i * 5;
    params.push(userId, key, Math.floor(Number(p.t)), p.callIv ?? null, p.putIv ?? null);
    values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`);
  });

  await query(
    `INSERT INTO iv_history (user_id, strategy_key, t, call_iv, put_iv)
     VALUES ${values.join(",")}
     ON CONFLICT (user_id, strategy_key, t)
     DO UPDATE SET call_iv = EXCLUDED.call_iv, put_iv = EXCLUDED.put_iv, updated_at = now()`,
    params
  );

  // Retention: keep only the newest MAX_POINTS for this strategy.
  await query(
    `DELETE FROM iv_history
     WHERE user_id = $1 AND strategy_key = $2 AND t < (
       SELECT MIN(t) FROM (
         SELECT t FROM iv_history WHERE user_id = $1 AND strategy_key = $2 ORDER BY t DESC LIMIT $3
       ) keep
     )`,
    [userId, key, MAX_POINTS]
  );

  return NextResponse.json({ ok: true, written: batch.length });
}
