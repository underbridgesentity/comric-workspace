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
      from: "COMRiC Workspace <alerts@comric-workspace.co.za>",
      to,
      subject: `[COMRiC] ${subject}`,
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
