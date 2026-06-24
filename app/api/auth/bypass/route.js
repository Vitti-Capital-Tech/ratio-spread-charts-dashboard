import { Pool } from "pg";
import { NextResponse } from "next/server";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (email.trim().toLowerCase() !== "trade@test.com") {
      return NextResponse.json({ error: "Bypass authentication is restricted to authorized test accounts only." }, { status: 403 });
    }

    // 1. Find user or create if not exists
    let userResult = await pool.query(
      `SELECT * FROM "user" WHERE "email" = $1`,
      [email]
    );

    let user = userResult.rows[0];

    if (!user) {
      const userId = crypto.randomUUID();
      const name = email.split("@")[0];
      const now = new Date();
      const insertUserResult = await pool.query(
        `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [userId, name, email, true, now, now]
      );
      user = insertUserResult.rows[0];
    }

    // 2. Create session in "session" table
    const sessionId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days session
    const ipAddress = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "";

    await pool.query(
      `INSERT INTO "session" ("id", "expiresAt", "token", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [sessionId, expiresAt, token, now, now, ipAddress, userAgent, user.id]
    );

    const response = NextResponse.json({ success: true });

    // Set Better Auth session cookie
    response.cookies.set("better-auth.session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return response;
  } catch (err) {
    console.error("Direct SQL bypass auth error:", err);
    return NextResponse.json({ error: err.message || "Authentication failed" }, { status: 500 });
  }
}
