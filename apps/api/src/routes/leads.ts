import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../lib/http.js";

export const leadsRouter = Router();
const leadInput = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  company: z.string().trim().max(160).optional(),
  title: z.string().trim().max(160).optional(),
});
const pageInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(100).optional(),
  q: z.string().trim().max(100).optional(),
});

leadsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { limit, cursor, q } = pageInput.parse(req.query);
    const workspaceId = req.workspaceId!;
    if (cursor) {
      const ownedCursor = await prisma.lead.findFirst({
        where: { id: cursor, workspaceId },
        select: { id: true },
      });
      if (!ownedCursor) {
        res.status(400).json({
          error: {
            code: "INVALID_CURSOR",
            message: "Cursor is not valid in this workspace",
          },
        });
        return;
      }
    }
    const data = await prisma.lead.findMany({
      where: {
        workspaceId,
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" as const } },
                { company: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const hasMore = data.length > limit;
    if (hasMore) data.pop();
    res.json({ data, nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null });
  }),
);

leadsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = leadInput.parse(req.body);
    const lead = await prisma.lead.create({
      data: { ...data, workspaceId: req.workspaceId! },
    });
    res.status(201).json({ data: lead });
  }),
);

leadsRouter.get(
  "/:leadId",
  asyncRoute(async (req, res) => {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.leadId, workspaceId: req.workspaceId! },
    });
    if (!lead) {
      res
        .status(404)
        .json({ error: { code: "LEAD_NOT_FOUND", message: "Lead not found" } });
      return;
    }
    res.json({ data: lead });
  }),
);

leadsRouter.patch(
  "/:leadId",
  asyncRoute(async (req, res) => {
    const data = leadInput.partial().parse(req.body);
    if (!Object.keys(data).length) {
      res.status(400).json({
        error: {
          code: "EMPTY_UPDATE",
          message: "Provide at least one field",
        },
      });
      return;
    }
    const updated = await prisma.lead.updateMany({
      where: { id: req.params.leadId, workspaceId: req.workspaceId! },
      data,
    });
    if (!updated.count) {
      res
        .status(404)
        .json({ error: { code: "LEAD_NOT_FOUND", message: "Lead not found" } });
      return;
    }
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.leadId, workspaceId: req.workspaceId! },
    });
    res.json({ data: lead });
  }),
);

leadsRouter.delete(
  "/:leadId",
  asyncRoute(async (req, res) => {
    const deleted = await prisma.lead.deleteMany({
      where: { id: req.params.leadId, workspaceId: req.workspaceId! },
    });
    if (!deleted.count) {
      res
        .status(404)
        .json({ error: { code: "LEAD_NOT_FOUND", message: "Lead not found" } });
      return;
    }
    res.status(204).end();
  }),
);
