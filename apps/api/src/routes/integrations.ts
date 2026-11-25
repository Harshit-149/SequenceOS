import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../lib/http.js";

export const integrationsRouter = Router();
const providers = [
  "INFRAOS",
  "SCOUTOS",
  "TRIAGEOS",
  "SALESFORCE",
  "HUBSPOT",
] as const;
const input = z.object({
  provider: z.enum(providers),
  enabled: z.boolean(),
  senderName: z.string().trim().max(100).optional(),
  senderEmail: z.string().trim().email().max(254).optional(),
});

integrationsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const rows = await prisma.integration.findMany({
      where: { workspaceId: req.workspaceId! },
      select: {
        id: true,
        provider: true,
        enabled: true,
        updatedAt: true,
        config: true,
      },
    });
    res.json({
      data: rows.map(({ id, provider, enabled, updatedAt, config }) => ({
        id,
        provider,
        enabled,
        updatedAt,
        config,
      })),
    });
  }),
);

integrationsRouter.put(
  "/:provider",
  asyncRoute(async (req, res) => {
    const provider = z.enum(providers).parse(req.params.provider);
    const { enabled, senderName, senderEmail } = input
      .omit({ provider: true })
      .parse(req.body);
    if (enabled && provider !== "INFRAOS") {
      res.status(409).json({
        error: {
          code: "INTEGRATION_UNAVAILABLE",
          message: `${provider} is not configured. Its provider contract and credentials are required first.`,
        },
      });
      return;
    }
    if (
      enabled &&
      (process.env.EMAIL_PROVIDER !== "infraos" ||
        !process.env.INFRAOS_API_URL ||
        !process.env.INFRAOS_API_KEY)
    ) {
      res.status(409).json({
        error: {
          code: "PROVIDER_NOT_CONFIGURED",
          message: "Configure InfraOS on the server before enabling it.",
        },
      });
      return;
    }
    const config = {
      ...(senderName ? { senderName } : {}),
      ...(senderEmail ? { senderEmail: senderEmail.toLowerCase() } : {}),
    };
    const row = await prisma.integration.upsert({
      where: {
        workspaceId_provider: { workspaceId: req.workspaceId!, provider },
      },
      create: { workspaceId: req.workspaceId!, provider, enabled, config },
      update: { enabled, config },
    });
    res.json({
      data: {
        id: row.id,
        provider: row.provider,
        enabled: row.enabled,
        updatedAt: row.updatedAt,
        config: row.config,
      },
    });
  }),
);
