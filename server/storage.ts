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
import { randomUUID } from "crypto";
import { sql, eq, desc } from "drizzle-orm"; // Assuming these are available from drizzle-orm

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

export class MemStorage implements IStorage {
  private static instance: MemStorage;
  private users: Map<string, User> = new Map();
  private messages: Map<string, Message> = new Map();
  private quantumKeys: Map<string, QuantumKey> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();
  private keyRequests: Map<string, KeyRequest> = new Map();

  constructor() {
    // Singleton pattern to ensure data persistence
    if (MemStorage.instance) {
      return MemStorage.instance;
    }
    
    // Initialize with some sample quantum keys
    this.initializeSampleKeys();
    MemStorage.instance = this;
  }

  private initializeSampleKeys() {
    const sampleKeys: InsertQuantumKey[] = [
      {
        keyId: "QK-2024-0127-847B3F",
        keyMaterial: Buffer.from(crypto.getRandomValues(new Uint8Array(4096))).toString('base64'),
        keyLength: 4096,
        maxConsumptionBytes: 4096,
        expiryTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
      {
        keyId: "QK-2024-0127-9C8E2A",
        keyMaterial: Buffer.from(crypto.getRandomValues(new Uint8Array(8192))).toString('base64'),
        keyLength: 8192,
        maxConsumptionBytes: 8192,
        expiryTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    ];

    for (const key of sampleKeys) {
      this.createQuantumKey(key);
    }
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      smtpConfig: insertUser.smtpConfig || null,
      imapConfig: insertUser.imapConfig || null,
      defaultSecurityLevel: insertUser.defaultSecurityLevel || "level1",
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Message methods
  async getMessagesByUser(userId: string, folder = "inbox", limit = 50): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(msg => msg.userId === userId && msg.folder === folder)
      .sort((a, b) => b.receivedAt!.getTime() - a.receivedAt!.getTime())
      .slice(0, limit);
  }

  async getMessage(id: string): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      body: insertMessage.body || null,
      encryptedBody: insertMessage.encryptedBody || null,
      keyId: insertMessage.keyId || null,
      isEncrypted: insertMessage.isEncrypted || false,
      isDecrypted: insertMessage.isDecrypted || false,
      attachments: insertMessage.attachments || null,
      encryptedAttachments: (insertMessage as any).encryptedAttachments || null,
      folder: insertMessage.folder || "inbox",
      receivedAt: new Date()
    };
    this.messages.set(id, message);
    return message;
  }

  async updateMessage(id: string, updates: Partial<Message>): Promise<Message | undefined> {
    const message = this.messages.get(id);
    if (!message) return undefined;

    const updatedMessage = { ...message, ...updates };
    this.messages.set(id, updatedMessage);
    return updatedMessage;
  }

  async deleteMessage(id: string): Promise<boolean> {
    return this.messages.delete(id);
  }

  // Quantum key methods
  async getQuantumKey(keyId: string): Promise<QuantumKey | undefined> {
    return Array.from(this.quantumKeys.values()).find(key => key.keyId === keyId);
  }

  async getActiveKeys(): Promise<QuantumKey[]> {
    return Array.from(this.quantumKeys.values())
      .filter(key => key.isActive && key.expiryTime > new Date())
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  }

  async createQuantumKey(insertKey: InsertQuantumKey): Promise<QuantumKey> {
    const id = randomUUID();
    const key: QuantumKey = {
      ...insertKey,
      id,
      keyMaterial: insertKey.keyMaterial || null,
      consumedBytes: insertKey.consumedBytes || 0,
      isActive: insertKey.isActive !== undefined ? insertKey.isActive : true,
      createdAt: new Date()
    };
    this.quantumKeys.set(id, key);
    return key;
  }

  async updateQuantumKey(keyId: string, updates: Partial<QuantumKey>): Promise<QuantumKey | undefined> {
    const key = await this.getQuantumKey(keyId);
    if (!key) return undefined;

    const updatedKey = { ...key, ...updates };
    this.quantumKeys.set(key.id, updatedKey);
    return updatedKey;
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

  // Audit log methods
  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const id = randomUUID();
    const log: AuditLog = {
      ...insertLog,
      id,
      details: insertLog.details || {},
      userId: insertLog.userId || null,
      ipAddress: insertLog.ipAddress || null,
      userAgent: insertLog.userAgent || null,
      timestamp: new Date()
    };
    this.auditLogs.set(id, log);
    return log;
  }

  async getAuditLogs(userId?: string, limit = 50): Promise<AuditLog[]> {
    let logs = Array.from(this.auditLogs.values());

    if (userId) {
      logs = logs.filter(log => log.userId === userId);
    }

    return logs
      .sort((a, b) => b.timestamp!.getTime() - a.timestamp!.getTime())
      .slice(0, limit);
  }

  // Key request methods
  async createKeyRequest(insertRequest: InsertKeyRequest): Promise<KeyRequest> {
    const id = randomUUID();
    const request: KeyRequest = {
      ...insertRequest,
      id,
      status: insertRequest.status || "pending",
      recipient: insertRequest.recipient || null,
      deliveryUri: insertRequest.deliveryUri || null,
      createdAt: new Date()
    };
    this.keyRequests.set(id, request);
    return request;
  }

  async getKeyRequest(requestId: string): Promise<KeyRequest | undefined> {
    return Array.from(this.keyRequests.values()).find(req => req.requestId === requestId);
  }

  async updateKeyRequest(requestId: string, updates: Partial<KeyRequest>): Promise<KeyRequest | undefined> {
    const request = this.keyRequests.get(requestId);
    if (!request) return undefined;

    const updatedRequest = { ...request, ...updates };
    this.keyRequests.set(request.id, updatedRequest);
    return updatedRequest;
  }
}

export const storage = new MemStorage();