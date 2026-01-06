import {
  users,
  messages,
  auditLogs,
  quantumKeys,
  keyRequests,
  type User,
  type Message,
  type AuditLog,
  type QuantumKey,
  type KeyRequest,
  type InsertUser,
  type InsertMessage,
  type InsertAuditLog,
  type InsertQuantumKey,
  type InsertKeyRequest
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // Message methods
  getMessagesByUser(userId: string, folder?: string, limit?: number): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, updates: Partial<Message>): Promise<Message | undefined>;
  deleteMessage(id: string): Promise<boolean>;

  // Quantum key methods
  getQuantumKey(keyId: string): Promise<QuantumKey | undefined>;
  getActiveKeys(): Promise<QuantumKey[]>;
  createQuantumKey(key: InsertQuantumKey): Promise<QuantumKey>;
  updateQuantumKey(keyId: string, updates: Partial<QuantumKey>): Promise<QuantumKey | undefined>;
  consumeKey(keyId: string, bytes: number): Promise<boolean>;

  // Audit log methods
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(userId?: string, limit?: number): Promise<AuditLog[]>;

  // Key request methods
  createKeyRequest(request: InsertKeyRequest): Promise<KeyRequest>;
  getKeyRequest(requestId: string): Promise<KeyRequest | undefined>;
  updateKeyRequest(requestId: string, updates: Partial<KeyRequest>): Promise<KeyRequest | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  // Message methods
  async getMessagesByUser(userId: string, folder = "inbox", limit = 50): Promise<Message[]> {
    const messagesList = await db
      .select()
      .from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.folder, folder)))
      .orderBy(desc(messages.receivedAt))
      .limit(limit);

    console.log(`Retrieved ${messagesList.length} messages for user ${userId} in folder ${folder}`);
    return messagesList;
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message || undefined;
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async updateMessage(id: string, updates: Partial<Message>): Promise<Message | undefined> {
    const [message] = await db
      .update(messages)
      .set({
        ...updates,
        editedAt: updates.body ? new Date() : undefined
      })
      .where(eq(messages.id, id))
      .returning();
    return message || undefined;
  }

  async deleteMessage(id: string): Promise<boolean> {
    const result = await db.delete(messages).where(eq(messages.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Quantum key methods
  async getQuantumKey(keyId: string): Promise<QuantumKey | undefined> {
    const [key] = await db.select().from(quantumKeys).where(eq(quantumKeys.keyId, keyId));
    return key || undefined;
  }

  async getActiveKeys(): Promise<QuantumKey[]> {
    return await db
      .select()
      .from(quantumKeys)
      .where(and(eq(quantumKeys.isActive, true)))
      .orderBy(quantumKeys.createdAt);
  }

  async createQuantumKey(insertKey: InsertQuantumKey): Promise<QuantumKey> {
    const [key] = await db
      .insert(quantumKeys)
      .values(insertKey)
      .returning();
    return key;
  }

  async updateQuantumKey(keyId: string, updates: Partial<QuantumKey>): Promise<QuantumKey | undefined> {
    const [key] = await db
      .update(quantumKeys)
      .set(updates)
      .where(eq(quantumKeys.keyId, keyId))
      .returning();
    return key || undefined;
  }

  async consumeKey(keyId: string, bytes: number): Promise<boolean> {
    const key = await this.getQuantumKey(keyId);
    if (!key || !key.isActive) return false;

    const newConsumedBytes = (key.consumedBytes || 0) + bytes;
    if (newConsumedBytes > key.maxConsumptionBytes) return false;

    await this.updateQuantumKey(keyId, {
      consumedBytes: newConsumedBytes,
      isActive: newConsumedBytes < key.maxConsumptionBytes
    });

    return true;
  }

  async updateQuantumKeyUsage(keyId: string, consumedBytes: number): Promise<boolean> {
    const key = await this.getQuantumKey(keyId);
    if (!key) return false;

    const newConsumedBytes = (key.consumedBytes || 0) + consumedBytes;
    if (newConsumedBytes > key.maxConsumptionBytes) return false;

    await this.updateQuantumKey(keyId, {
      consumedBytes: newConsumedBytes,
      isActive: newConsumedBytes < key.maxConsumptionBytes
    });

    return true;
  }

  // Audit log methods
  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db
      .insert(auditLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  async getAuditLogs(userId?: string, limit = 50): Promise<AuditLog[]> {
    if (userId) {
      return await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, userId))
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit);
    } else {
      return await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit);
    }
  }

  // Key request methods
  async createKeyRequest(insertRequest: InsertKeyRequest): Promise<KeyRequest> {
    const [request] = await db
      .insert(keyRequests)
      .values(insertRequest)
      .returning();
    return request;
  }

  async getKeyRequest(requestId: string): Promise<KeyRequest | undefined> {
    const [request] = await db.select().from(keyRequests).where(eq(keyRequests.requestId, requestId));
    return request || undefined;
  }

  async updateKeyRequest(requestId: string, updates: Partial<KeyRequest>): Promise<KeyRequest | undefined> {
    const [request] = await db
      .update(keyRequests)
      .set(updates)
      .where(eq(keyRequests.requestId, requestId))
      .returning();
    return request || undefined;
  }
}

export const storage = new DatabaseStorage();