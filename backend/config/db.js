import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    const { host, name } = mongoose.connection;
    console.log(`MongoDB connected (${host}/${name})`);
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    throw err;
  }
}
