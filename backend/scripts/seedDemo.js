import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { reseedDemoUser } from "../lib/demoSeed.js";

// CLI: rebuild the read-only demo account and its sample data.
//   node scripts/seedDemo.js
await connectDB();
const user = await reseedDemoUser();
console.log(`✅ Demo account reseeded: ${user.username} (${user._id})`);
await mongoose.disconnect();
process.exit(0);
