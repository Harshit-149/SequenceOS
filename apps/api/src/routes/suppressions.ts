import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../lib/http.js";

export const suppressionsRouter = Router();
const addInput = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  reason: z.enum(["UNSUBSCRIBED", "BOUNCED", "COMPLAINT", "MANUAL"]),
});

suppressionsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const data = await prisma.suppression.findMany({
      where: { workspaceId: req.workspaceId! },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ data });
  }),
);
suppressionsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = addInput.parse(req.body);
    const suppression = await prisma.suppression.upsert({
      where: {
        workspaceId_email: { workspaceId: req.workspaceId!, email: data.email },
      },
      create: { ...data, workspaceId: req.workspaceId! },
      update: { reason: data.reason },
    });
    res.status(201).json({ data: suppression });
  }),
);
