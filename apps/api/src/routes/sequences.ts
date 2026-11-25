import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../lib/http.js";

export const sequencesRouter = Router();
const input = z.object({
  campaignId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
});
const stepInput = z.object({
  position: z.number().int().min(0).max(49),
  delayMinutes: z.number().int().min(0).max(525600),
  templateId: z.string().min(1),
});

sequencesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const data = await prisma.sequence.findMany({
      where: { workspaceId: req.workspaceId! },
      include: {
        steps: {
          orderBy: { position: "asc" },
          include: {
            template: { select: { id: true, name: true, subject: true } },
          },
        },
        campaign: { select: { id: true, name: true, status: true } },
        _count: { select: { enrollments: true } },
      },
      take: 100,
      orderBy: { updatedAt: "desc" },
    });
    res.json({ data });
  }),
);

sequencesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = input.parse(req.body);
    const campaign = await prisma.campaign.findFirst({
      where: { id: data.campaignId, workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!campaign) {
      res.status(404).json({
        error: {
          code: "CAMPAIGN_NOT_FOUND",
          message: "Campaign not found in this workspace",
        },
      });
      return;
    }
    const sequence = await prisma.sequence.create({
      data: {
        name: data.name,
        campaignId: campaign.id,
        workspaceId: req.workspaceId!,
      },
    });
    res.status(201).json({ data: sequence });
  }),
);

sequencesRouter.post(
  "/:sequenceId/steps",
  asyncRoute(async (req, res) => {
    const data = stepInput.parse(req.body);
    const workspaceId = req.workspaceId!;
    const sequence = await prisma.sequence.findFirst({
      where: { id: req.params.sequenceId, workspaceId },
      select: { id: true },
    });
    if (!sequence) {
      res.status(404).json({
        error: { code: "SEQUENCE_NOT_FOUND", message: "Sequence not found" },
      });
      return;
    }
    const template = await prisma.emailTemplate.findFirst({
      where: { id: data.templateId, workspaceId },
      select: { id: true },
    });
    if (!template) {
      res.status(404).json({
        error: {
          code: "TEMPLATE_NOT_FOUND",
          message: "Template not found in this workspace",
        },
      });
      return;
    }
    const expectedPosition = await prisma.sequenceStep.count({
      where: { sequenceId: sequence.id, workspaceId },
    });
    if (data.position !== expectedPosition) {
      res.status(400).json({
        error: {
          code: "INVALID_STEP_ORDER",
          message: `The next step position must be ${expectedPosition}`,
        },
      });
      return;
    }
    const step = await prisma.sequenceStep.create({
      data: { ...data, sequenceId: sequence.id, workspaceId },
    });
    res.status(201).json({ data: step });
  }),
);

sequencesRouter.post(
  "/:sequenceId/enrollments",
  asyncRoute(async (req, res) => {
    const { leadIds } = z
      .object({ leadIds: z.array(z.string().min(1)).min(1).max(500) })
      .parse(req.body);
    const workspaceId = req.workspaceId!;
    const [sequence, leads] = await Promise.all([
      prisma.sequence.findFirst({
        where: { id: req.params.sequenceId, workspaceId },
        include: {
          campaign: { select: { status: true } },
          steps: { orderBy: { position: "asc" } },
        },
      }),
      prisma.lead.findMany({
        where: { id: { in: leadIds }, workspaceId },
        select: { id: true, email: true },
      }),
    ]);
    if (!sequence) {
      res.status(404).json({
        error: { code: "SEQUENCE_NOT_FOUND", message: "Sequence not found" },
      });
      return;
    }
    if (sequence.campaign.status !== "ACTIVE") {
      res.status(409).json({
        error: {
          code: "CAMPAIGN_PAUSED",
          message: "Activate the campaign before enrolling leads",
        },
      });
      return;
    }
    if (!sequence.steps.length) {
      res.status(409).json({
        error: {
          code: "SEQUENCE_EMPTY",
          message: "Add a step before enrolling leads",
        },
      });
      return;
    }
    if (leads.length !== new Set(leadIds).size) {
      res.status(400).json({
        error: {
          code: "INVALID_LEADS",
          message: "One or more leads do not belong to this workspace",
        },
      });
      return;
    }
    const suppressed = await prisma.suppression.findMany({
      where: { workspaceId, email: { in: leads.map((lead) => lead.email) } },
      select: { email: true },
    });
    const suppressedEmails = new Set(suppressed.map((item) => item.email));
    const eligible = leads.filter((lead) => !suppressedEmails.has(lead.email));
    const enrollments = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const lead of eligible) {
        rows.push(
          await tx.enrollment.upsert({
            where: {
              sequenceId_leadId: { sequenceId: sequence.id, leadId: lead.id },
            },
            create: { workspaceId, sequenceId: sequence.id, leadId: lead.id },
            update: {},
          }),
        );
      }
      const firstStep = sequence.steps[0];
      if (firstStep)
        await tx.sequenceOutbox.createMany({
          data: rows
            .filter((item) => item.status === "ACTIVE")
            .map((item) => ({
              workspaceId,
              enrollmentId: item.id,
              stepId: firstStep.id,
              idempotencyKey: `${item.id}:${firstStep.id}`,
              availableAt: new Date(
                Date.now() + firstStep.delayMinutes * 60_000,
              ),
            })),
          skipDuplicates: true,
        });
      return rows;
    });
    res.status(201).json({
      data: enrollments,
      scheduled: enrollments.filter((item) => item.status === "ACTIVE").length,
      skippedSuppressed: leads.length - eligible.length,
    });
  }),
);
