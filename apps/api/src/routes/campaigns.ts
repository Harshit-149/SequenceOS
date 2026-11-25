import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../lib/http.js";

export const campaignsRouter = Router();
const input = z.object({
  name: z.string().trim().min(2).max(120),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).default("DRAFT"),
});
const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(100).optional(),
});

campaignsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { limit, cursor } = page.parse(req.query);
    if (cursor) {
      const ownedCursor = await prisma.campaign.findFirst({
        where: { id: cursor, workspaceId: req.workspaceId! },
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
    const rows = await prisma.campaign.findMany({
      where: { workspaceId: req.workspaceId! },
      include: { _count: { select: { sequences: true } } },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    res.json({
      data: rows,
      nextCursor: hasMore ? (rows.at(-1)?.id ?? null) : null,
    });
  }),
);

campaignsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = input.parse(req.body);
    const campaign = await prisma.campaign.create({
      data: { ...data, workspaceId: req.workspaceId! },
    });
    res.status(201).json({ data: campaign });
  }),
);

campaignsRouter.patch(
  "/:campaignId",
  asyncRoute(async (req, res) => {
    const data = input.partial().parse(req.body);
    if (!Object.keys(data).length) {
      res.status(400).json({
        error: {
          code: "EMPTY_UPDATE",
          message: "Provide at least one field",
        },
      });
      return;
    }
    const updated = await prisma.campaign.updateMany({
      where: { id: req.params.campaignId, workspaceId: req.workspaceId! },
      data,
    });
    if (!updated.count) {
      res.status(404).json({
        error: { code: "CAMPAIGN_NOT_FOUND", message: "Campaign not found" },
      });
      return;
    }
    if (data.status === "ACTIVE") {
      const sequences = await prisma.sequence.findMany({
        where: {
          campaignId: req.params.campaignId,
          workspaceId: req.workspaceId!,
        },
        include: { steps: { orderBy: { position: "asc" } } },
      });
      const enrollments = await prisma.enrollment.findMany({
        where: {
          workspaceId: req.workspaceId!,
          sequenceId: { in: sequences.map((sequence) => sequence.id) },
          status: "ACTIVE",
        },
      });
      const currentStep = new Map(
        sequences.map((sequence) => [sequence.id, sequence.steps]),
      );
      await prisma.sequenceOutbox.createMany({
        data: enrollments.flatMap((enrollment) => {
          const step = currentStep.get(enrollment.sequenceId)?.[
            enrollment.currentStep
          ];
          return step
            ? [
                {
                  workspaceId: req.workspaceId!,
                  enrollmentId: enrollment.id,
                  stepId: step.id,
                  idempotencyKey: `${enrollment.id}:${step.id}`,
                  availableAt: new Date(),
                },
              ]
            : [];
        }),
        skipDuplicates: true,
      });
    }
    res.json({
      data: await prisma.campaign.findFirst({
        where: { id: req.params.campaignId, workspaceId: req.workspaceId! },
      }),
    });
  }),
);
