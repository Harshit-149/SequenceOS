import { Router } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../lib/http.js";
import {
  createRefreshToken,
  hashToken,
  issueAccessToken,
} from "../lib/auth.js";
import { config } from "../config.js";

export const authRouter = Router();
const signupBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
  workspaceName: z.string().trim().min(2).max(100),
});
const loginBody = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});

const setRefreshCookie = (res: import("express").Response, token: string) => {
  const maxAge = config.REFRESH_TOKEN_TTL_DAYS * 86_400;
  res.cookie("sequenceos_refresh", token, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: maxAge * 1000,
  });
};
const clearRefreshCookie = (res: import("express").Response) =>
  res.clearCookie("sequenceos_refresh", {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
  });
const cookieValue = (req: import("express").Request, name: string) =>
  req
    .header("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

authRouter.post(
  "/signup",
  asyncRoute(async (req, res) => {
    const input = signupBody.parse(req.body);
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const refreshToken = createRefreshToken();
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        memberships: {
          create: {
            role: "OWNER",
            workspace: { create: { name: input.workspaceName } },
          },
        },
      },
      include: { memberships: { include: { workspace: true } } },
    });
    await prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(
          Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86400000,
        ),
      },
    });
    setRefreshCookie(res, refreshToken);
    res.status(201).json({
      accessToken: await issueAccessToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
      workspaces: user.memberships.map(({ role, workspace }) => ({
        id: workspace.id,
        name: workspace.name,
        role,
      })),
    });
  }),
);

authRouter.post(
  "/login",
  asyncRoute(async (req, res) => {
    const input = loginBody.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { memberships: { include: { workspace: true } } },
    });
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email or password is incorrect",
        },
      });
      return;
    }
    const refreshToken = createRefreshToken();
    await prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(
          Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86400000,
        ),
      },
    });
    setRefreshCookie(res, refreshToken);
    res.json({
      accessToken: await issueAccessToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
      workspaces: user.memberships.map(({ role, workspace }) => ({
        id: workspace.id,
        name: workspace.name,
        role,
      })),
    });
  }),
);

authRouter.post(
  "/refresh",
  asyncRoute(async (req, res) => {
    const refreshToken = cookieValue(req, "sequenceos_refresh");
    if (
      !refreshToken ||
      refreshToken.length < 32 ||
      refreshToken.length > 256
    ) {
      res.status(401).json({
        error: {
          code: "INVALID_SESSION",
          message: "Refresh session is invalid or expired",
        },
      });
      return;
    }
    const tokenHash = hashToken(refreshToken);
    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: { include: { memberships: { include: { workspace: true } } } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      res.status(401).json({
        error: {
          code: "INVALID_SESSION",
          message: "Refresh session is invalid or expired",
        },
      });
      return;
    }
    const nextToken = createRefreshToken();
    const accessToken = await issueAccessToken(session.userId);
    const rotated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      await tx.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: hashToken(nextToken),
          expiresAt: new Date(
            Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86400000,
          ),
        },
      });
      return true;
    });
    if (!rotated) {
      clearRefreshCookie(res);
      res.status(401).json({
        error: {
          code: "INVALID_SESSION",
          message: "Refresh session is invalid or expired",
        },
      });
      return;
    }
    setRefreshCookie(res, nextToken);
    res.json({
      accessToken,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      workspaces: session.user.memberships.map(({ role, workspace }) => ({
        id: workspace.id,
        name: workspace.name,
        role,
      })),
    });
  }),
);

authRouter.post(
  "/logout",
  asyncRoute(async (req, res) => {
    const refreshToken = cookieValue(req, "sequenceos_refresh");
    if (
      refreshToken &&
      refreshToken.length >= 32 &&
      refreshToken.length <= 256
    ) {
      await prisma.refreshSession.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearRefreshCookie(res);
    res.status(204).end();
  }),
);
