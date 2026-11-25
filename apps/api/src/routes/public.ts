import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../lib/http.js";
import { verifyUnsubscribeToken } from "../lib/unsubscribe-token.js";

export const publicRouter = Router();

publicRouter.post(
  "/unsubscribe",
  asyncRoute(async (req, res) => {
    const { token } = z
      .object({ token: z.string().min(32).max(2048) })
      .parse(req.body);
    let identity: { workspaceId: string; email: string };
    try {
      identity = await verifyUnsubscribeToken(token);
    } catch {
      res.status(400).json({
        error: {
          code: "INVALID_UNSUBSCRIBE_TOKEN",
          message: "This unsubscribe link is invalid or expired",
        },
      });
      return;
    }
    await prisma.$transaction([
      prisma.suppression.upsert({
        where: {
          workspaceId_email: {
            workspaceId: identity.workspaceId,
            email: identity.email,
          },
        },
        create: {
          workspaceId: identity.workspaceId,
          email: identity.email,
          reason: "UNSUBSCRIBED",
        },
        update: { reason: "UNSUBSCRIBED" },
      }),
      prisma.enrollment.updateMany({
        where: {
          workspaceId: identity.workspaceId,
          lead: { email: identity.email },
          status: "ACTIVE",
        },
        data: { status: "UNSUBSCRIBED", completedAt: new Date() },
      }),
    ]);
    res.json({ data: { unsubscribed: true } });
  }),
);
