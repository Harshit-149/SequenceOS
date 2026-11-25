import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../lib/http.js";

export const workspacesRouter = Router();

workspacesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
    res.json({
      data: memberships.map(({ role, workspace }) => ({
        id: workspace.id,
        name: workspace.name,
        role,
      })),
    });
  }),
);

workspacesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const { name } = z
      .object({ name: z.string().trim().min(2).max(100) })
      .parse(req.body);
    const workspace = await prisma.workspace.create({
      data: {
        name,
        memberships: { create: { userId: req.userId!, role: "OWNER" } },
      },
    });
    res.status(201).json({
      data: { id: workspace.id, name: workspace.name, role: "OWNER" },
    });
  }),
);
