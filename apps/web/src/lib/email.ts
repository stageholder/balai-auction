import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

/** Send a transactional email via Resend. Never throws into the caller: a
 *  failed or unconfigured email must not break the action that triggered it. */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) {
    console.warn(
      `Resend not configured (RESEND_API_KEY/RESEND_FROM); skipping email to ${msg.to}`
    );
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Resend send failed (${res.status}) to ${msg.to}: ${detail}`);
    }
  } catch (err) {
    console.error(`Resend send error to ${msg.to}:`, err);
  }
}
