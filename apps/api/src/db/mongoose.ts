import mongoose from "mongoose";

const SERVER_SELECTION_TIMEOUT_MS = 5_000;

export async function connectDatabase(uri: string): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  await mongoose.connect(uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
