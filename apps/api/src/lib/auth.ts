import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { z } from "zod";

const jwtKey = new TextEncoder().encode(config.JWT_SECRET);
declare global {
  // Express extends its request type through declaration merging.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      workspaceId?: string;
      workspaceRole?: "OWNER" | "ADMIN" | "MEMBER";
      requestId?: string;
      rawBody?: Buffer;
    }
  }
}

export const issueAccessToken = async (userId: string) =>
  new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(config.ACCESS_TOKEN_TTL)
    .sign(jwtKey);

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const createRefreshToken = () => randomBytes(48).toString("base64url");

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const value = req.header("authorization");
  if (!value?.startsWith("Bearer ")) {
    res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Sign in to continue" },
    });
    return;
  }
  try {
    const verified = await jwtVerify(value.slice(7), jwtKey, {
      algorithms: ["HS256"],
    });
    if (!verified.payload.sub) throw new Error("Missing subject");
    req.userId = verified.payload.sub;
    next();
  } catch {
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Access token is invalid or expired",
      },
    });
  }
};

export const requireWorkspace = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const workspaceId = req.params.workspaceId ?? req.header("x-workspace-id");
  if (!workspaceId || !req.userId) {
    res.status(400).json({
      error: { code: "WORKSPACE_REQUIRED", message: "Select a workspace" },
    });
    return;
  }
  if (!z.string().min(1).max(100).safeParse(workspaceId).success) {
    res.status(400).json({
      error: {
        code: "INVALID_WORKSPACE_ID",
        message: "Workspace id is invalid",
      },
    });
    return;
  }
  try {
    const membership = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: req.userId, workspaceId } },
      select: { workspaceId: true, role: true },
    });
    if (!membership) {
      res.status(404).json({
        error: {
          code: "WORKSPACE_NOT_FOUND",
          message: "Workspace not found",
        },
      });
      return;
    }
    req.workspaceId = membership.workspaceId;
    req.workspaceRole = membership.role;
    next();
  } catch (error) {
    next(error);
  }
};
