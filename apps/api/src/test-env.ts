process.env.NODE_ENV = "test";
process.env.PORT = "4000";
process.env.WEB_ORIGIN = "http://localhost:5173";
process.env.DATABASE_URL =
  "postgresql://sequenceos:sequenceos@localhost:5432/sequenceos";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.JWT_SECRET = "test-only-secret-at-least-32-characters-long";
process.env.TRIAGEOS_WEBHOOK_SECRET =
  "test-only-triageos-webhook-secret-32bytes";
process.env.EMAIL_PROVIDER = "console";
process.env.OPENAI_API_KEY = "";
