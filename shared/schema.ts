import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  emailProvider: text("email_provider").notNull(), // gmail, outlook, yahoo
  smtpConfig: jsonb("smtp_config"),
  imapConfig: jsonb("imap_config"),
  defaultSecurityLevel: text("default_security_level").default("level1"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  messageId: text("message_id").notNull(), // email message ID
  from: text("from").notNull(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body"),
  encryptedBody: text("encrypted_body"),
  securityLevel: text("security_level").notNull(),
  keyId: text("key_id"),
  isEncrypted: boolean("is_encrypted").default(false),
  isDecrypted: boolean("is_decrypted").default(false),
  metadata: jsonb("metadata"),
  attachments: jsonb("attachments"),
  encryptedAttachments: jsonb("encrypted_attachments"),
  receivedAt: timestamp("received_at").defaultNow(),
  folder: text("folder").default("inbox"), // inbox, sent, trash
});

export const quantumKeys = pgTable("quantum_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyId: text("key_id").notNull().unique(),
  keyMaterial: text("key_material"), // base64 encoded
  keyLength: integer("key_length").notNull(),
  consumedBytes: integer("consumed_bytes").default(0),
  maxConsumptionBytes: integer("max_consumption_bytes").notNull(),
  expiryTime: timestamp("expiry_time").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const keyRequests = pgTable("key_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: text("request_id").notNull().unique(),
  keyLength: integer("key_length").notNull(),
  recipient: text("recipient"),
  status: text("status").default("pending"), // pending, delivered, consumed
  deliveryUri: text("delivery_uri"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  receivedAt: true,
});

export const insertQuantumKeySchema = createInsertSchema(quantumKeys).omit({
  id: true,
  createdAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  timestamp: true,
});

export const insertKeyRequestSchema = createInsertSchema(keyRequests).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type QuantumKey = typeof quantumKeys.$inferSelect;
export type InsertQuantumKey = z.infer<typeof insertQuantumKeySchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type KeyRequest = typeof keyRequests.$inferSelect;
export type InsertKeyRequest = z.infer<typeof insertKeyRequestSchema>;

// Security levels enum
export enum SecurityLevel {
  LEVEL1_OTP = "level1",
  LEVEL2_AES = "level2", 
  LEVEL3_PQC = "level3",
  LEVEL4_PLAIN = "level4"
}

// Email provider enum
export enum EmailProvider {
  GMAIL = "gmail",
  OUTLOOK = "outlook", 
  YAHOO = "yahoo"
}
