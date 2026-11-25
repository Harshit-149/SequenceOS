import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { sendEmail } from "../lib/email-sender.js";
import { createUnsubscribeToken } from "../lib/unsubscribe-token.js";
import type { SequenceJob } from "../lib/sequence-queue.js";
import { dispatchPendingEvents } from "./dispatch-outbox.js";

const personalize = (source: string, values: Record<string, string>) =>
  source.replace(
    /\{\{\s*(firstName|lastName|company|title|email)\s*\}\}/g,
    (_match, name: string) => values[name] ?? "",
  );
const deferEvent = async (eventId: string, minutes: number) =>
  prisma.sequenceOutbox.updateMany({
    where: { id: eventId },
    data: {
      status: "PENDING",
      availableAt: new Date(Date.now() + minutes * 60_000),
      queuedAt: null,
    },
  });

const claimAttempt = async (
  workspaceId: string,
  enrollmentId: string,
  stepId: string,
  key: string,
) => {
  const now = new Date();
  const existing = await prisma.sendAttempt.findUnique({
    where: { idempotencyKey: key },
  });
  if (existing && ["SENT", "DELIVERED", "SIMULATED"].includes(existing.status))
    return false;
  if (
    existing?.status === "SENDING" &&
    existing.lockedUntil &&
    existing.lockedUntil > now
  )
    return false;
  if (!existing) {
    try {
      await prisma.sendAttempt.create({
        data: {
          workspaceId,
          enrollmentId,
          stepId,
          idempotencyKey: key,
          status: "SENDING",
          lockedUntil: new Date(now.getTime() + 120_000),
        },
      });
      return true;
    } catch (error) {
      if (!(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ))
        throw error;
    }
  }
  const updated = await prisma.sendAttempt.updateMany({
    where: {
      idempotencyKey: key,
      OR: [
        { status: { in: ["QUEUED", "FAILED"] } },
        { status: "SENDING", lockedUntil: { lt: now } },
      ],
    },
    data: {
      status: "SENDING",
      lockedUntil: new Date(now.getTime() + 120_000),
      errorCode: null,
    },
  });
  return updated.count === 1;
};

const processStep = async (job: Job<SequenceJob>) => {
  const { workspaceId, enrollmentId, stepId, outboxEventId } = job.data;
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, workspaceId },
    include: {
      lead: true,
      sequence: {
        include: {
          campaign: true,
          steps: { include: { template: true }, orderBy: { position: "asc" } },
        },
      },
    },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") return;
  const step = enrollment.sequence.steps.find((item) => item.id === stepId);
  if (!step || step.position !== enrollment.currentStep) return;
  if (enrollment.sequence.campaign.status !== "ACTIVE") {
    await deferEvent(outboxEventId, 5);
    return;
  }

  const suppression = await prisma.suppression.findUnique({
    where: {
      workspaceId_email: {
        workspaceId,
        email: enrollment.lead.email.toLowerCase(),
      },
    },
  });
  if (suppression) {
    await prisma.enrollment.updateMany({
      where: { id: enrollment.id, workspaceId, status: "ACTIVE" },
      data: { status: "UNSUBSCRIBED", completedAt: new Date() },
    });
    return;
  }
  if (config.EMAIL_PROVIDER === "infraos") {
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: "INFRAOS" } },
      select: { enabled: true, config: true },
    });
    if (!integration?.enabled) {
      await deferEvent(outboxEventId, 10);
      return;
    }
  }

  const idempotencyKey = `${enrollment.id}:${step.id}`;
  if (
    !(await claimAttempt(workspaceId, enrollment.id, step.id, idempotencyKey))
  )
    return;
  const values = {
    firstName: enrollment.lead.firstName ?? "",
    lastName: enrollment.lead.lastName ?? "",
    company: enrollment.lead.company ?? "",
    title: enrollment.lead.title ?? "",
    email: enrollment.lead.email,
  };
  try {
    const token = await createUnsubscribeToken(
      workspaceId,
      enrollment.lead.email.toLowerCase(),
    );
    const unsubscribeUrl = new URL(
      `/unsubscribe?token=${encodeURIComponent(token)}`,
      config.WEB_ORIGIN,
    ).toString();
    const subject = personalize(step.template.subject, values);
    const body = personalize(step.template.bodyText, values);
    const integration =
      config.EMAIL_PROVIDER === "infraos"
        ? await prisma.integration.findUnique({
            where: {
              workspaceId_provider: { workspaceId, provider: "INFRAOS" },
            },
            select: { config: true },
          })
        : null;
    const sender =
      typeof integration?.config === "object" && integration.config !== null
        ? (integration.config as { senderName?: string; senderEmail?: string })
        : {};
    const result = await sendEmail({
      to: enrollment.lead.email,
      fromName: sender.senderName ?? config.DEFAULT_FROM_NAME,
      fromEmail: sender.senderEmail ?? config.DEFAULT_FROM_EMAIL,
      subject,
      text: `${body}\n\nUnsubscribe: ${unsubscribeUrl}`,
      idempotencyKey,
    });
    await prisma.$transaction(async (tx) => {
      await tx.sendAttempt.update({
        where: { idempotencyKey },
        data: {
          status: result.status,
          providerId: result.providerId,
          sentAt: new Date(),
          lockedUntil: null,
        },
      });
      const nextStep = enrollment.sequence.steps[step.position + 1];
      if (nextStep) {
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { currentStep: nextStep.position },
        });
        await tx.sequenceOutbox.createMany({
          data: [
            {
              workspaceId,
              enrollmentId,
              stepId: nextStep.id,
              idempotencyKey: `${enrollmentId}:${nextStep.id}`,
              availableAt: new Date(
                Date.now() + nextStep.delayMinutes * 60_000,
              ),
            },
          ],
          skipDuplicates: true,
        });
      } else {
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      }
    });
  } catch (error) {
    await prisma.sendAttempt.update({
      where: { idempotencyKey },
      data: {
        status: "FAILED",
        errorCode:
          error instanceof Error ? error.name.slice(0, 80) : "SEND_FAILED",
        lockedUntil: null,
      },
    });
    throw error;
  }
};

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const worker = new Worker<SequenceJob>("sequence-send", processStep, {
  connection,
  concurrency: 8,
});
worker.on("failed", (job, error) =>
  console.error("Sequence job failed", { jobId: job?.id, error: error.name }),
);

let polling = false;
const poll = async () => {
  if (polling) return;
  polling = true;
  try {
    await dispatchPendingEvents();
  } catch (error) {
    console.error(
      "Sequence outbox dispatch failed",
      error instanceof Error ? error.name : "UnknownError",
    );
  } finally {
    polling = false;
  }
};
void poll();
const timer = setInterval(() => void poll(), 2_000);

const shutdown = async () => {
  clearInterval(timer);
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
