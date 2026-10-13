import "server-only";

/** The database client lives in @msv/data so the Voice Agent server shares it. */
export { prisma } from "@msv/data";
