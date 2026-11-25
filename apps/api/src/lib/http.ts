import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

export const requestId: RequestHandler = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};

export const notFound: RequestHandler = (_req, res) => {
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Route not found" } });
};

export const asyncRoute =
  (
    handler: (
      req: import("express").Request,
      res: import("express").Response,
    ) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    void handler(req, res).catch(next);
  };

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten(),
        requestId: res.getHeader("x-request-id"),
      },
    });
    return;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "A record with those unique values already exists",
        requestId: res.getHeader("x-request-id"),
      },
    });
    return;
  }
  if (
    error instanceof SyntaxError &&
    "status" in error &&
    error.status === 400
  ) {
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body contains invalid JSON",
        requestId: res.getHeader("x-request-id"),
      },
    });
    return;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body exceeds the 256 KB limit",
        requestId: res.getHeader("x-request-id"),
      },
    });
    return;
  }
  console.error(
    "Unhandled request error",
    error instanceof Error ? error.message : "Unknown error",
  );
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      requestId: res.getHeader("x-request-id"),
    },
  });
};
