export function describeExternalError(error: unknown): { name: string; code?: string; message: string } {
  const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : undefined;
  const details: { name: string; code?: string; message: string } = {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error)
  };
  if (typeof record?.code === "string" || typeof record?.code === "number") details.code = String(record.code);
  return details;
}
