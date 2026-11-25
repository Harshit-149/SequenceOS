import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../lib/http.js";

export const templatesRouter = Router();
const input = z.object({
  name: z.string().trim().min(2).max(100),
  subject: z.string().trim().min(1).max(250),
  bodyText: z.string().min(1).max(100_000),
});

templatesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const data = await prisma.emailTemplate.findMany({
      where: { workspaceId: req.workspaceId! },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    res.json({ data });
  }),
);
templatesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = input.parse(req.body);
    const template = await prisma.emailTemplate.create({
      data: { ...data, workspaceId: req.workspaceId! },
    });
    res.status(201).json({ data: template });
  }),
);
templatesRouter.patch(
  "/:templateId",
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
    const updated = await prisma.emailTemplate.updateMany({
      where: { id: req.params.templateId, workspaceId: req.workspaceId! },
      data,
    });
    if (!updated.count) {
      res.status(404).json({
        error: { code: "TEMPLATE_NOT_FOUND", message: "Template not found" },
      });
      return;
    }
    res.json({
      data: await prisma.emailTemplate.findFirst({
        where: { id: req.params.templateId, workspaceId: req.workspaceId! },
      }),
    });
  }),
);
