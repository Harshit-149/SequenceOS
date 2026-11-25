import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

export type SequenceJob = {
  workspaceId: string;
  enrollmentId: string;
  stepId: string;
  outboxEventId: string;
};
let queue: Queue<SequenceJob> | undefined;

export const getSequenceQueue = () => {
  if (!queue) {
    const connection = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    queue = new Queue<SequenceJob>("sequence-send", {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
        removeOnFail: false,
      },
    });
  }
  return queue;
};
