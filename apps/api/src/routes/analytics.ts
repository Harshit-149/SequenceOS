import { Router } from "express";
import { prisma } from "../db.js";
import { asyncRoute } from "../lib/http.js";

export const analyticsRouter = Router();

analyticsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [
      leads,
      campaigns,
      activeSequences,
      enrollments,
      sends,
      recentActivity,
    ] = await Promise.all([
      prisma.lead.count({ where: { workspaceId } }),
      prisma.campaign.count({ where: { workspaceId, status: "ACTIVE" } }),
      prisma.sequence.count({
        where: { workspaceId, campaign: { status: "ACTIVE" } },
      }),
      prisma.enrollment.count({ where: { workspaceId, status: "ACTIVE" } }),
      prisma.sendAttempt.groupBy({
        by: ["status"],
        where: { workspaceId, createdAt: { gte: monthStart } },
        _count: { _all: true },
      }),
      prisma.sendAttempt.findMany({
        where: { workspaceId },
        take: 8,
        orderBy: { createdAt: "desc" },
        include: {
          enrollment: {
            include: {
              lead: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                  company: true,
                },
              },
              sequence: { select: { name: true } },
            },
          },
          step: { select: { position: true } },
        },
      }),
    ]);
    const sentThisMonth = sends
      .filter((item) => item.status === "SENT" || item.status === "DELIVERED")
      .reduce((sum, item) => sum + item._count._all, 0);
    res.json({
      data: {
        leads,
        activeCampaigns: campaigns,
        activeSequences,
        activeEnrollments: enrollments,
        sentThisMonth,
        sendsByStatus: Object.fromEntries(
          sends.map((item) => [item.status, item._count._all]),
        ),
        recentActivity,
      },
    });
  }),
);
