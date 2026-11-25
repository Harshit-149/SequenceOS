import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({
  path:
    process.env.DOTENV_CONFIG_PATH ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);
const optionalSecret = (min = 1) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().min(min).optional(),
  );

const configSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    DATABASE_URL: z
      .string()
      .min(1)
      .refine(
        (value) => /^postgres(?:ql)?:\/\//.test(value),
        "A PostgreSQL URL is required.",
      ),
    REDIS_URL: z.string().url().default("redis://localhost:6379"),
    JWT_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL: z
      .string()
      .regex(/^\d+[smhd]$/)
      .default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    EMAIL_PROVIDER: z.enum(["console", "infraos"]).default("console"),
    INFRAOS_API_URL: optionalUrl,
    INFRAOS_API_KEY: optionalSecret(),
    TRIAGEOS_WEBHOOK_SECRET: optionalSecret(32),
    OPENAI_API_KEY: optionalSecret(),
    OPENAI_MODEL: z.string().trim().min(1).max(100).default("gpt-6.2-astra"),
    DEFAULT_FROM_NAME: z.string().trim().min(1).max(100).default("SequenceOS"),
    DEFAULT_FROM_EMAIL: z
      .string()
      .trim()
      .email()
      .default("outreach@example.invalid"),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && value.EMAIL_PROVIDER !== "infraos") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_PROVIDER"],
        message: "Production requires a configured email provider.",
      });
    }
    if (
      value.EMAIL_PROVIDER === "infraos" &&
      (!value.INFRAOS_API_URL || !value.INFRAOS_API_KEY)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["INFRAOS_API_URL"],
        message:
          "InfraOS URL and API key are required when EMAIL_PROVIDER=infraos.",
      });
    }
    if (value.NODE_ENV === "production") {
      if (!value.WEB_ORIGIN.startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          path: ["WEB_ORIGIN"],
          message: "Production WEB_ORIGIN must use HTTPS.",
        });
      }
      if (!value.REDIS_URL.startsWith("rediss://")) {
        ctx.addIssue({
          code: "custom",
          path: ["REDIS_URL"],
          message: "Production Redis must use TLS (rediss://).",
        });
      }
      if (value.DEFAULT_FROM_EMAIL.endsWith(".invalid")) {
        ctx.addIssue({
          code: "custom",
          path: ["DEFAULT_FROM_EMAIL"],
          message:
            "Production DEFAULT_FROM_EMAIL must be a verified sending address.",
        });
      }
      if (
        value.EMAIL_PROVIDER === "infraos" &&
        !value.INFRAOS_API_URL?.startsWith("https://")
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["INFRAOS_API_URL"],
          message: "Production InfraOS URL must use HTTPS.",
        });
      }
    }
  });

export const config = configSchema.parse(process.env);
