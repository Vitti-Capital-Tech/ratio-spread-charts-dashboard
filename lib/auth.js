import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Pool } from "pg";
import { Resend } from "resend";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL || 
           (process.env.NODE_ENV === "development" ? "http://localhost:3000" : process.env.NEXT_PUBLIC_APP_URL),
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
        
        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: `[Vitti OptionScope] Verification Token: ${otp}`,
          html: `
            <div style="background-color: #0b0e11; color: #eaecef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; max-width: 550px; margin: 0 auto; border-radius: 8px; border: 1px solid #2b2f36;">
              <div style="text-align: center; margin-bottom: 30px; border-bottom: 1px solid #2b2f36; padding-bottom: 20px;">
                <h1 style="color: #f0b90b; font-size: 22px; font-weight: 800; margin: 0; letter-spacing: 1px;">VITTI OPTION<span style="color: #848e9c; font-weight: 400;">SCOPE</span></h1>
                <p style="color: #848e9c; font-size: 11px; font-weight: 600; text-transform: uppercase; margin: 5px 0 0 0; letter-spacing: 1.5px;">Trader Identity Authentication</p>
              </div>
              
              <div style="padding: 0 10px;">
                <p style="font-size: 14px; line-height: 1.6; color: #eaecef; margin-bottom: 25px;">
                  An authentication request has been initiated for your option spread charts dashboard. Use the security token below to authorize access to your session.
                </p>
                
                <div style="text-align: center; margin: 35px 0;">
                  <p style="color: #848e9c; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; font-weight: 600;">One-Time Security Token</p>
                  <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #f0b90b; background: #181a20; padding: 16px 28px; border-radius: 6px; display: inline-block; border: 1px solid #2b2f36; font-family: monospace;">
                    ${otp}
                  </div>
                </div>
                
                <div style="background: rgba(240, 185, 11, 0.04); border-left: 3px solid #f0b90b; padding: 12px 16px; border-radius: 0 4px 4px 0; margin-bottom: 25px;">
                  <p style="font-size: 12px; line-height: 1.5; color: #f0b90b; margin: 0; font-weight: 500;">
                    Security Notice: This token is valid for 10 minutes. Vitti Capital staff members will never ask you for this code. If you did not request this code, secure your email account immediately.
                  </p>
                </div>
              </div>
              
              <div style="text-align: center; border-top: 1px solid #2b2f36; padding-top: 20px; margin-top: 30px;">
                <p style="font-size: 9px; color: #848e9c; margin: 0; font-family: monospace; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.5px;">
                  VITTI CAPITAL SYSTEM GATEWAY • CLIENT AUTH SERVICE
                </p>
              </div>
            </div>
          `,
        });
      },
    }),
  ],
});
