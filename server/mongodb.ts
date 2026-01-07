import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

export async function connectMongoDB() {
  if (!MONGODB_URI) {
    console.warn("MONGODB_URI not defined. Skipping MongoDB connection - emails will be stored in PostgreSQL instead.");
    return;
  }
  
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds instead of 30
    });
    console.log("Successfully connected to MongoDB Atlas");
  } catch (error) {
    console.warn("MongoDB connection failed. Emails will be stored in PostgreSQL instead.");
    // We don't exit the process here to allow the app to run even if MongoDB fails
    // This is useful for environments where the IP might not be whitelisted yet
  }
}

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected. Attempting to reconnect...");
});
