import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import { asyncRoute, errorHandler, notFound, requestId } from "./lib/http.js";
import { prisma } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { workspacesRouter } from "./routes/workspaces.js";
import { leadsRouter } from "./routes/leads.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { templatesRouter } from "./routes/templates.js";
import { sequencesRouter } from "./routes/sequences.js";
import { analyticsRouter } from "./routes/analytics.js";
import { suppressionsRouter } from "./routes/suppressions.js";
import { integrationsRouter } from "./routes/integrations.js";
import { publicRouter } from "./routes/public.js";
import { personalizationRouter } from "./routes/personalization.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authenticate, requireWorkspace } from "./lib/auth.js";

export const app = express();
app.disable("x-powered-by");
app.use(requestId);
app.use(helmet());
app.use(
  cors({
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(
  express.json({
    limit: "256kb",
    verify: (req, _res, buffer) => {
      (req as import("express").Request).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);

app.get("/api/v1/health", (_req, res) =>
  res.json({ status: "ok", service: "sequenceos-api" }),
);
app.get(
  "/api/v1/ready",
  asyncRoute(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", service: "sequenceos-api" });
  }),
);
app.use(
  "/api/v1/auth",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  authRouter,
);
app.use("/api/v1/public", publicRouter);
app.use("/api/v1/workspaces", authenticate, workspacesRouter);
app.use(
  "/api/v1/workspaces/:workspaceId/leads",
  authenticate,
  requireWorkspace,
  leadsRouter,
);
app.use(
  "/api/v1/workspaces/:workspaceId/campaigns",
  authenticate,
  requireWorkspace,
  campaignsRouter,
);
app.use(
  "/api/v1/workspaces/:workspaceId/templates",
  authenticate,
  requireWorkspace,
  templatesRouter,
);
app.use(
  "/api/v1/workspaces/:workspaceId/sequences",
  authenticate,
  requireWorkspace,
  sequencesRouter,
);
app.use(
  "/api/v1/workspaces/:workspaceId/analytics",
  authenticate,
  requireWorkspace,
  analyticsRouter,
);
app.use(
  "/api/v1/workspaces/:workspaceId/suppressions",
  authenticate,
  requireWorkspace,
  suppressionsRouter,
);
app.use(
  "/api/v1/workspaces/:workspaceId/integrations",
  authenticate,
  requireWorkspace,
  integrationsRouter,
);
app.use(
  "/api/v1/workspaces/:workspaceId/personalizations",
  authenticate,
  requireWorkspace,
  personalizationRouter,
);
app.post(
  "/api/v1/webhooks/triageos",
  (req, res, next) => {
    const signature = req.header("x-triageos-signature") ?? "";
    if (
      !config.TRIAGEOS_WEBHOOK_SECRET ||
      !req.rawBody ||
      !/^sha256=[a-f0-9]{64}$/i.test(signature)
    ) {
      res.status(401).json({
        error: {
          code: "INVALID_SIGNATURE",
          message: "Webhook signature is invalid",
        },
      });
      return;
    }
    const expected = createHmac("sha256", config.TRIAGEOS_WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest();
    const supplied = Buffer.from(signature.slice(7), "hex");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.status(401).json({
        error: {
          code: "INVALID_SIGNATURE",
          message: "Webhook signature is invalid",
        },
      });
      return;
    }
    next();
  },
  async (req, res, next) => {
    try {
      const { prisma } = await import("./db.js");
      const { z } = await import("zod");
      const event = z
        .object({
          id: z.string().min(1).max(200),
          workspaceId: z.string().min(1).max(100),
          type: z.enum(["reply", "unsubscribe", "bounce", "complaint"]),
          email: z
            .string()
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
        })
        .parse(req.body);
      const workspace = await prisma.workspace.findUnique({
        where: { id: event.workspaceId },
        select: { id: true },
      });
      if (!workspace) {
        res.status(404).json({
          error: {
            code: "WORKSPACE_NOT_FOUND",
            message: "Workspace not found",
          },
        });
        return;
      }
      const duplicate = await prisma.webhookReceipt.findUnique({
        where: {
          provider_eventId: { provider: "TRIAGEOS", eventId: event.id },
        },
      });
      if (duplicate) {
        res.status(200).json({ data: { received: true, duplicate: true } });
        return;
      }
      try {
        await prisma.$transaction(async (tx) => {
          await tx.webhookReceipt.create({
            data: {
              provider: "TRIAGEOS",
              eventId: event.id,
              workspaceId: event.workspaceId,
            },
          });
          if (event.type === "reply") {
            await tx.enrollment.updateMany({
              where: {
                workspaceId: event.workspaceId,
                lead: { email: event.email },
                status: "ACTIVE",
              },
              data: { status: "REPLIED", completedAt: new Date() },
            });
          } else {
            const reason =
              event.type === "unsubscribe"
                ? "UNSUBSCRIBED"
                : event.type === "bounce"
                  ? "BOUNCED"
                  : "COMPLAINT";
            await tx.suppression.upsert({
              where: {
                workspaceId_email: {
                  workspaceId: event.workspaceId,
                  email: event.email,
                },
              },
              create: {
                workspaceId: event.workspaceId,
                email: event.email,
                reason,
              },
              update: { reason },
            });
            const status = event.type === "bounce" ? "BOUNCED" : "UNSUBSCRIBED";
            await tx.enrollment.updateMany({
              where: {
                workspaceId: event.workspaceId,
                lead: { email: event.email },
                status: "ACTIVE",
              },
              data: { status, completedAt: new Date() },
            });
          }
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          res.status(200).json({ data: { received: true, duplicate: true } });
          return;
        }
        throw error;
      }
      res.status(200).json({ data: { received: true } });
    } catch (error) {
      next(error);
    }
  },
);
app.use(notFound);
app.use(errorHandler);
