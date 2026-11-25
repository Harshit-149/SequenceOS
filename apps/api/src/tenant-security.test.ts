import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    membership: { findUnique: vi.fn() },
    lead: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("./db.js", () => ({ prisma: mockPrisma }));

import { app } from "./app.js";
import { issueAccessToken } from "./lib/auth.js";

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Could not start test server");
const baseUrl = `http://127.0.0.1:${address.port}`;
const userToken = await issueAccessToken("user-a");

afterAll(() => server.close());
beforeEach(() => vi.clearAllMocks());

describe("workspace isolation", () => {
  it("rejects access to a workspace without membership before querying leads", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue(null);
    const response = await fetch(
      `${baseUrl}/api/v1/workspaces/workspace-b/leads`,
      { headers: { authorization: `Bearer ${userToken}` } },
    );
    expect(response.status).toBe(404);
    expect(mockPrisma.lead.findMany).not.toHaveBeenCalled();
  });

  it("scopes authorized lead queries to the membership workspace", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      workspaceId: "workspace-a",
      role: "MEMBER",
    });
    mockPrisma.lead.findMany.mockResolvedValue([]);
    const response = await fetch(
      `${baseUrl}/api/v1/workspaces/workspace-a/leads`,
      { headers: { authorization: `Bearer ${userToken}` } },
    );
    expect(response.status).toBe(200);
    expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "workspace-a" } }),
    );
  });

  it("ignores a workspace header that conflicts with the route workspace", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue(null);
    const response = await fetch(
      `${baseUrl}/api/v1/workspaces/workspace-b/leads`,
      {
        headers: {
          authorization: `Bearer ${userToken}`,
          "x-workspace-id": "workspace-a",
        },
      },
    );
    expect(response.status).toBe(404);
    expect(mockPrisma.membership.findUnique).toHaveBeenCalledWith({
      where: {
        userId_workspaceId: { userId: "user-a", workspaceId: "workspace-b" },
      },
      select: { workspaceId: true, role: true },
    });
  });

  it("keeps AI personalization disabled when no server key is configured", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      workspaceId: "workspace-a",
      role: "MEMBER",
    });
    const response = await fetch(
      `${baseUrl}/api/v1/workspaces/workspace-a/personalizations`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${userToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ leadId: "lead-a", templateId: "template-a" }),
      },
    );
    expect(response.status).toBe(503);
    expect(mockPrisma.lead.findFirst).not.toHaveBeenCalled();
  });
});
