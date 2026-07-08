import { Resend } from "resend";

/**
 * Email escalation path via Resend. Degrades gracefully: if
 * RESEND_API_KEY is unset, sends are skipped (in-app alerts still fire).
 */
export async function sendAlertEmail(
  to: string,
  subject: string,
  body: string,
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from: "COMRiC Workspace <alerts@comricworkspace.co.za>",
      to,
      subject,
      html: `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
  <div style="background:#0a0c10;padding:20px 24px;">
    <span style="color:#ffffff;font-weight:900;font-size:18px;letter-spacing:-0.5px;">COMRiC</span>
    <span style="color:#8eff00;font-weight:700;font-size:11px;margin-left:8px;letter-spacing:2px;">WORKSPACE</span>
  </div>
  <div style="padding:24px;border:1px solid #e6e8ec;border-top:none;">
    <h2 style="color:#0a0c10;font-size:16px;margin:0 0 12px;">${subject}</h2>
    <p style="color:#5b636e;font-size:14px;line-height:1.6;margin:0;">${body}</p>
  </div>
</div>`,
    });
    return true;
  } catch (err) {
    console.error("resend send failed", err);
    return false;
  }
}

/**
 * Branded invite email with the one-time setup link. Same graceful
 * degradation as sendAlertEmail: returns false when email is not
 * configured or the send fails, so callers can offer the link directly.
 */
export async function sendInviteEmail(
  to: string,
  fullName: string,
  roleLabel: string,
  setupUrl: string,
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from: "COMRiC Workspace <alerts@comricworkspace.co.za>",
      to,
      subject: "You have been invited to COMRiC Workspace",
      html: `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
  <div style="background:#0a0c10;padding:20px 24px;">
    <span style="color:#ffffff;font-weight:900;font-size:18px;letter-spacing:-0.5px;">COMRiC</span>
    <span style="color:#8eff00;font-weight:700;font-size:11px;margin-left:8px;letter-spacing:2px;">WORKSPACE</span>
  </div>
  <div style="padding:24px;border:1px solid #e6e8ec;border-top:none;">
    <h2 style="color:#0a0c10;font-size:16px;margin:0 0 12px;">Welcome, ${fullName}</h2>
    <p style="color:#5b636e;font-size:14px;line-height:1.6;margin:0 0 20px;">
      You have been invited to COMRiC Workspace as <strong style="color:#0a0c10;">${roleLabel}</strong>.
      Set your password to complete your account setup.
    </p>
    <p style="margin:0 0 20px;">
      <a href="${setupUrl}" style="display:inline-block;background:#8eff00;color:#0a0c10;font-weight:700;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:8px;">Set up your account</a>
    </p>
    <p style="color:#5b636e;font-size:12px;line-height:1.6;margin:0;">
      This link expires in 7 days and can be used once. If the button does not work, copy this URL into your browser:<br />
      <span style="color:#0a0c10;word-break:break-all;">${setupUrl}</span>
    </p>
  </div>
</div>`,
    });
    return true;
  } catch (err) {
    console.error("resend invite send failed", err);
    return false;
  }
}
