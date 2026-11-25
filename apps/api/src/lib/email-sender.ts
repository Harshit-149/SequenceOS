import { z } from "zod";
import { config } from "../config.js";

export type OutboundMessage = {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey: string;
};
export type SendResult = { status: "SENT" | "SIMULATED"; providerId?: string };

export const sendEmail = async (
  message: OutboundMessage,
): Promise<SendResult> => {
  if (config.EMAIL_PROVIDER === "console") {
    console.info("Email simulated", {
      recipientDomain: message.to.split("@").at(-1),
      idempotencyKey: message.idempotencyKey,
    });
    return {
      status: "SIMULATED",
      providerId: `simulated:${message.idempotencyKey}`,
    };
  }

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12_000);
  try {
    const response = await fetch(
      new URL("/v1/messages", config.INFRAOS_API_URL!),
      {
        method: "POST",
        signal: abort.signal,
        headers: {
          authorization: `Bearer ${config.INFRAOS_API_KEY}`,
          "content-type": "application/json",
          "idempotency-key": message.idempotencyKey,
        },
        body: JSON.stringify({
          to: message.to,
          from: { name: message.fromName, email: message.fromEmail },
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      },
    );
    if (!response.ok)
      throw new Error(`InfraOS returned status ${response.status}`);
    const result = z
      .object({ id: z.string().min(1).max(200) })
      .parse(await response.json());
    return { status: "SENT", providerId: result.id };
  } finally {
    clearTimeout(timeout);
  }
};
