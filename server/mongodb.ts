import mongoose from "mongoose";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is not defined");
}

const MONGODB_URI = process.env.MONGODB_URI;

export async function connectMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Successfully connected to MongoDB Atlas");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
}

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected. Attempting to reconnect...");
});
