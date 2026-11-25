import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app.js";

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Could not start test server");
const baseUrl = `http://127.0.0.1:${address.port}`;

afterAll(() => server.close());

describe("health endpoint", () => {
  it("reports API health", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      service: "sequenceos-api",
    });
  });
  it("returns the standard not found error", async () => {
    const response = await fetch(`${baseUrl}/missing`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
  it("requires authentication for workspace routes", async () => {
    const response = await fetch(`${baseUrl}/api/v1/workspaces`);
    expect(response.status).toBe(401);
  });
  it("allows the configured browser origin to make integration PUT requests", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workspaces/workspace-a/integrations/INFRAOS`,
      {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "PUT",
          "access-control-request-headers": "authorization,content-type",
        },
      },
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "PUT",
    );
  });
  it("validates sign-up input before database access", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Jamie",
        email: "jamie@example.com",
        password: "short",
        workspaceName: "Northstar",
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });
  it("rejects webhook requests without a signature", async () => {
    const response = await fetch(`${baseUrl}/api/v1/webhooks/triageos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "event-1" }),
    });
    expect(response.status).toBe(401);
  });
});
