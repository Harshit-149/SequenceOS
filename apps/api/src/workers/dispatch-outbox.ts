import { prisma } from "../db.js";
import { getSequenceQueue } from "../lib/sequence-queue.js";

export const dispatchPendingEvents = async () => {
  const events = await prisma.sequenceOutbox.findMany({
    where: { status: "PENDING", availableAt: { lte: new Date() } },
    take: 100,
    orderBy: { availableAt: "asc" },
  });
  const queue = getSequenceQueue();
  for (const event of events) {
    await queue.add(
      "send-step",
      {
        workspaceId: event.workspaceId,
        enrollmentId: event.enrollmentId,
        stepId: event.stepId,
        outboxEventId: event.id,
      },
      {
        jobId: event.id,
        delay: Math.max(0, event.availableAt.getTime() - Date.now()),
      },
    );
    await prisma.sequenceOutbox.updateMany({
      where: { id: event.id, status: "PENDING" },
      data: { status: "QUEUED", queuedAt: new Date() },
    });
  }
  return events.length;
};
