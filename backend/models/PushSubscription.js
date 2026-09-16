import mongoose from "mongoose";

// One row per browser, not per user. A push endpoint is issued to a service
// worker registration, so it identifies a device, and a shared device can be
// re-pointed at a different account.
//
// Not embedded on User like accounts or recurring: requireAuth loads the whole
// user document on every request, and these long strings are never read there.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Unique across users, not per user: subscribing from a device that last
    // belonged to someone else moves the row, or their reminders would keep
    // arriving on a screen that is no longer theirs.
    endpoint: { type: String, required: true, unique: true, maxlength: 2000 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 200 },
      auth: { type: String, required: true, maxlength: 100 },
    },
    // Which notifications this device wants. Per device, so switching one off
    // on a laptop leaves the phone alone.
    types: {
      dailyReminder: { type: Boolean, default: false },
      morningBudget: { type: Boolean, default: false },
    },
    userAgent: { type: String, default: "", maxlength: 300 },
    lastSuccessAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("PushSubscription", pushSubscriptionSchema);
