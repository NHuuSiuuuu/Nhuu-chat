import type { Role } from "../models/user.model.js";

export const inboxAccessRoles = ["admin", "agent", "customer"] as const satisfies readonly Role[];
