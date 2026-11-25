import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

const key = new TextEncoder().encode(config.JWT_SECRET);
const audience = "sequenceos-unsubscribe";

export const createUnsubscribeToken = (workspaceId: string, email: string) =>
  new SignJWT({ workspaceId, email, purpose: "unsubscribe" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);

export const verifyUnsubscribeToken = async (token: string) => {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
    audience,
  });
  if (
    payload.purpose !== "unsubscribe" ||
    typeof payload.workspaceId !== "string" ||
    typeof payload.email !== "string" ||
    payload.sub !== payload.email
  )
    throw new Error("Invalid unsubscribe token");
  return { workspaceId: payload.workspaceId, email: payload.email };
};
