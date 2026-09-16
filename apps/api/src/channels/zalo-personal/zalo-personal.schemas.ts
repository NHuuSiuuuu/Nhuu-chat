import { z } from "zod";

export const zaloPersonalStatus = ["disconnected", "waiting_qr", "connected", "expired", "error"] as const;

export const zaloPersonalStatusSchema = z.object({
  id: z.string(),
  status: z.enum(zaloPersonalStatus),
  qrData: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  displayName: z.string().optional(),
  username: z.string().optional(),
  zaloUserId: z.string().optional(),
  errorCode: z.string().optional()
}).strict();

export type ZaloPersonalStatus = z.infer<typeof zaloPersonalStatusSchema>;
