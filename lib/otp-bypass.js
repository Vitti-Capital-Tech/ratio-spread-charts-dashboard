import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

/**
 * OTP-bypass plugin.
 *
 * ⚠️ SECURITY WARNING — this is an authentication BACKDOOR. When the correct
 * secret word (env `BYPASS_WORD`) is posted to `/api/auth/otp-bypass`, it mints
 * a full session for the portal's owner account WITHOUT any OTP / email
 * verification.
 *
 * The account signed in as is `BYPASS_EMAIL` when set; otherwise it falls back
 * to the oldest user in the database (the first one ever created). This was
 * requested to work in ALL environments (including production). Anyone who
 * learns the word can log in. To disable it, remove `BYPASS_WORD` from the
 * environment — the endpoint then returns 404.
 */
export const otpBypass = () => ({
  id: "otp-bypass",
  endpoints: {
    otpBypass: createAuthEndpoint(
      "/otp-bypass",
      {
        method: "POST",
        body: z.object({
          word: z.string(),
        }),
      },
      async (ctx) => {
        const configuredWord = process.env.BYPASS_WORD;

        // Feature is only live when a word is configured. No word => no backdoor.
        if (!configuredWord) {
          throw new APIError("NOT_FOUND", { message: "Not found" });
        }

        if (ctx.body.word !== configuredWord) {
          throw new APIError("UNAUTHORIZED", { message: "Invalid access word." });
        }

        // Sign in as BYPASS_EMAIL when configured; otherwise fall back to the
        // oldest account (the first user created = portal owner).
        const targetEmail = process.env.BYPASS_EMAIL;
        let user;

        if (targetEmail) {
          const found = await ctx.context.internalAdapter.findUserByEmail(targetEmail);
          user = found?.user;
          if (!user) {
            throw new APIError("BAD_REQUEST", {
              message: `Bypass account ${targetEmail} not found.`,
            });
          }
        } else {
          const users = await ctx.context.internalAdapter.listUsers(1, 0, {
            field: "createdAt",
            direction: "asc",
          });
          user = users?.[0];
          if (!user) {
            throw new APIError("BAD_REQUEST", {
              message: "No account exists to sign in to.",
            });
          }
        }

        if (!user.emailVerified) {
          await ctx.context.internalAdapter.updateUser(user.id, {
            emailVerified: true,
          });
        }

        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) {
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Failed to create session.",
          });
        }

        await setSessionCookie(ctx, { session, user });

        return ctx.json({ ok: true });
      }
    ),
  },
});
