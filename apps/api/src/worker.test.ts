import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockAdd } = vi.hoisted(() => ({
  mockPrisma: { sequenceOutbox: { findMany: vi.fn(), updateMany: vi.fn() } },
  mockAdd: vi.fn(),
}));

vi.mock("./db.js", () => ({ prisma: mockPrisma }));
vi.mock("./lib/sequence-queue.js", () => ({
  getSequenceQueue: () => ({ add: mockAdd }),
}));

import { dispatchPendingEvents } from "./workers/dispatch-outbox.js";
import { sendEmail } from "./lib/email-sender.js";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./lib/unsubscribe-token.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.sequenceOutbox.findMany.mockResolvedValue([
    {
      id: "event-a",
      workspaceId: "workspace-a",
      enrollmentId: "enrollment-a",
      stepId: "step-a",
      availableAt: new Date(Date.now() + 60_000),
    },
  ]);
  mockPrisma.sequenceOutbox.updateMany.mockResolvedValue({ count: 1 });
  mockAdd.mockResolvedValue({ id: "event-a" });
});

describe("sequence outbox dispatch", () => {
  it("creates a stable delayed BullMQ job and marks its event queued", async () => {
    expect(await dispatchPendingEvents()).toBe(1);
    expect(mockAdd).toHaveBeenCalledWith(
      "send-step",
      {
        workspaceId: "workspace-a",
        enrollmentId: "enrollment-a",
        stepId: "step-a",
        outboxEventId: "event-a",
      },
      expect.objectContaining({ jobId: "event-a", delay: expect.any(Number) }),
    );
    expect(mockPrisma.sequenceOutbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "event-a", status: "PENDING" } }),
    );
  });

  it("leaves an event pending if Redis cannot accept the job", async () => {
    mockAdd.mockRejectedValue(new Error("Redis unavailable"));
    await expect(dispatchPendingEvents()).rejects.toThrow("Redis unavailable");
    expect(mockPrisma.sequenceOutbox.updateMany).not.toHaveBeenCalled();
  });
});

describe("email safety helpers", () => {
  it("simulates sends locally without contacting a provider", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await sendEmail({
      to: "person@example.com",
      fromName: "SequenceOS",
      fromEmail: "outreach@example.com",
      subject: "Hello",
      text: "Hello there",
      idempotencyKey: "enrollment:step",
    });
    expect(result.status).toBe("SIMULATED");
    expect(info).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  it("verifies signed unsubscribe tokens and rejects tampering", async () => {
    const token = await createUnsubscribeToken(
      "workspace-a",
      "person@example.com",
    );
    await expect(verifyUnsubscribeToken(token)).resolves.toEqual({
      workspaceId: "workspace-a",
      email: "person@example.com",
    });
    await expect(verifyUnsubscribeToken(`${token}x`)).rejects.toThrow();
  });
});
