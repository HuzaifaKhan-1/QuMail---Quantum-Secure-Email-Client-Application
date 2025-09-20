import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { kmeSimulator } from "./services/kmeSimulator";
import { emailService } from "./services/emailService";
import { SecurityLevel, insertUserSchema, insertAuditLogSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // User authentication routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password } = req.body;
      
      // Validate required fields
      if (!username || !email || !password) {
        return res.status(400).json({ message: "Username, email, and password are required" });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const user = await storage.createUser({
        username,
        email,
        password,
        emailProvider: "qumail", // Internal platform only
        defaultSecurityLevel: "level1"
      });
      
      // Log registration
      await storage.createAuditLog({
        userId: user.id,
        action: "user_registered",
        details: { email: user.email, provider: "qumail" },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      req.session.userId = user.id;
      res.json({ user: { id: user.id, email: user.email, username: user.username } });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await storage.getUserByEmail(email);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      await storage.createAuditLog({
        userId: user.id,
        action: "user_login",
        details: { email: user.email },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      req.session.userId = user.id;
      res.json({ user: { id: user.id, email: user.email, username: user.username } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    const userId = req.session.userId;
    
    await storage.createAuditLog({
      userId,
      action: "user_logout",
      details: {},
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    req.session.destroy(() => {
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          username: user.username,
          emailProvider: user.emailProvider,
          defaultSecurityLevel: user.defaultSecurityLevel
        } 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user info" });
    }
  });

  // KME Simulator routes (ETSI GS QKD-014 style)
  app.post("/kme/requestKey", async (req, res) => {
    try {
      const keyRequestSchema = z.object({
        request_id: z.string(),
        key_length_bits: z.number().positive(),
        recipient: z.string().optional()
      });

      const keyRequest = keyRequestSchema.parse(req.body);
      const response = await kmeSimulator.requestKey(keyRequest);
      
      res.json(response);
    } catch (error) {
      console.error("KME request key error:", error);
      res.status(400).json({ message: "Invalid key request" });
    }
  });

  app.get("/kme/keys/:keyId", async (req, res) => {
    try {
      const { keyId } = req.params;
      const keyMaterial = await kmeSimulator.getKey(keyId);
      
      if (!keyMaterial) {
        return res.status(404).json({ message: "Key not found or expired" });
      }

      res.json(keyMaterial);
    } catch (error) {
      console.error("KME get key error:", error);
      res.status(500).json({ message: "Failed to retrieve key" });
    }
  });

  app.post("/kme/keys/:keyId/ack", async (req, res) => {
    try {
      const { keyId } = req.params;
      const ackSchema = z.object({
        consumed_bytes: z.number().positive(),
        message_id: z.string().optional()
      });

      const ack = ackSchema.parse(req.body);
      const success = await kmeSimulator.acknowledgeKeyUsage(keyId, ack);
      
      if (!success) {
        return res.status(400).json({ message: "Failed to acknowledge key usage" });
      }

      res.json({ status: "acknowledged" });
    } catch (error) {
      console.error("KME ack error:", error);
      res.status(400).json({ message: "Invalid acknowledgment" });
    }
  });

  // Key management routes
  app.get("/api/keys/pool", requireAuth, async (req, res) => {
    try {
      const stats = await kmeSimulator.getKeyPoolStats();
      res.json(stats);
    } catch (error) {
      console.error("Get key pool error:", error);
      res.status(500).json({ message: "Failed to get key pool stats" });
    }
  });

  app.get("/api/keys", requireAuth, async (req, res) => {
    try {
      const keys = await storage.getActiveKeys();
      const safeKeys = keys.map(key => ({
        id: key.id,
        keyId: key.keyId,
        keyLength: key.keyLength,
        consumedBytes: key.consumedBytes,
        maxConsumptionBytes: key.maxConsumptionBytes,
        utilizationPercent: Math.round((key.consumedBytes || 0) / key.maxConsumptionBytes * 100),
        expiryTime: key.expiryTime,
        isActive: key.isActive,
        createdAt: key.createdAt
      }));
      
      res.json(safeKeys);
    } catch (error) {
      console.error("Get keys error:", error);
      res.status(500).json({ message: "Failed to get keys" });
    }
  });

  app.post("/api/keys/request", requireAuth, async (req, res) => {
    try {
      const requestSchema = z.object({
        keyLength: z.number().positive().default(8192),
        recipient: z.string().optional()
      });

      const { keyLength, recipient } = requestSchema.parse(req.body);
      
      const keyRequest = {
        request_id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        key_length_bits: keyLength * 8,
        recipient
      };

      const response = await kmeSimulator.requestKey(keyRequest);
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "key_requested",
        details: { keyId: response.key_id, keyLength },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json(response);
    } catch (error) {
      console.error("Request key error:", error);
      res.status(400).json({ message: "Failed to request key" });
    }
  });

  // Email routes
  app.get("/api/emails", requireAuth, async (req, res) => {
    try {
      const folder = req.query.folder as string || "inbox";
      const messages = await storage.getMessagesByUser(req.session.userId, folder);
      
      res.json(messages);
    } catch (error) {
      console.error("Get emails error:", error);
      res.status(500).json({ message: "Failed to get emails" });
    }
  });

  app.get("/api/emails/:messageId", requireAuth, async (req, res) => {
    try {
      const { messageId } = req.params;
      const message = await storage.getMessage(messageId);
      
      if (!message || message.userId !== req.session.userId) {
        return res.status(404).json({ message: "Message not found" });
      }

      res.json(message);
    } catch (error) {
      console.error("Get email error:", error);
      res.status(500).json({ message: "Failed to get email" });
    }
  });

  app.post("/api/emails/send", requireAuth, async (req, res) => {
    try {
      const sendSchema = z.object({
        to: z.string().email(),
        subject: z.string(),
        body: z.string(),
        securityLevel: z.nativeEnum(SecurityLevel),
        attachments: z.array(z.object({
          filename: z.string(),
          content: z.string(), // base64
          contentType: z.string()
        })).optional()
      });

      const emailData = sendSchema.parse(req.body);
      const user = await storage.getUser(req.session.userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Convert base64 attachments to Buffer
      const attachments = emailData.attachments?.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.contentType
      }));

      await emailService.sendEmail(user, {
        to: emailData.to,
        subject: emailData.subject,
        body: emailData.body,
        attachments,
        securityLevel: emailData.securityLevel
      });

      res.json({ message: "Email sent successfully" });
    } catch (error) {
      console.error("Send email error:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  app.post("/api/emails/:messageId/decrypt", requireAuth, async (req, res) => {
    try {
      const { messageId } = req.params;
      const result = await emailService.decryptEmail(messageId, req.session.userId);
      
      if (!result || (typeof result === 'object' && !result.success)) {
        return res.status(400).json({ message: "Failed to decrypt email" });
      }

      res.json({ 
        message: "Email decrypted successfully",
        success: true
      });
    } catch (error) {
      console.error("Decrypt email error:", error);
      res.status(500).json({ message: "Failed to decrypt email" });
    }
  });

  

  // Audit logs
  app.get("/api/audit", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getAuditLogs(req.session.userId, limit);
      
      res.json(logs);
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  // User settings
  app.put("/api/user/settings", requireAuth, async (req, res) => {
    try {
      const settingsSchema = z.object({
        defaultSecurityLevel: z.nativeEnum(SecurityLevel).optional(),
        smtpConfig: z.object({}).optional(),
        imapConfig: z.object({}).optional()
      });

      const settings = settingsSchema.parse(req.body);
      
      const updatedUser = await storage.updateUser(req.session.userId, settings);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "settings_updated",
        details: settings,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({ message: "Settings updated successfully" });
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Periodic key pool maintenance
  setInterval(async () => {
    try {
      await kmeSimulator.maintainKeyPool();
    } catch (error) {
      console.error("Key pool maintenance error:", error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  const httpServer = createServer(app);
  return httpServer;
}
