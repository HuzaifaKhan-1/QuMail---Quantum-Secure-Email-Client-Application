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
      const user = await storage.getUser(req.session.userId as string);
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
      const messages = await storage.getMessagesByUser(req.session.userId as string, folder);
      
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
      
      if (!message || message.userId !== (req.session.userId as string)) {
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
      const user = await storage.getUser(req.session.userId as string);
      
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
      const result = await emailService.decryptEmail(messageId, req.session.userId as string);
      
      if (!result || !result.success) {
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

  app.post("/api/emails/:messageId/delete-content", requireAuth, async (req, res) => {
    try {
      const { messageId } = req.params;
      const message = await storage.getMessage(messageId);
      
      if (!message || message.userId !== (req.session.userId as string)) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (message.securityLevel === SecurityLevel.LEVEL1_OTP) {
        await storage.updateMessage(messageId, {
          body: null,
          encryptedBody: null
        });
        
        await storage.createAuditLog({
          userId: req.session.userId as string,
          action: "email_content_purged",
          details: { messageId }
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Delete content error:", error);
      res.status(500).json({ message: "Failed to delete content" });
    }
  });

  app.get("/api/emails/:messageId/attachments/:attachmentIndex", requireAuth, async (req, res) => {
    try {
      const { messageId, attachmentIndex } = req.params;
      const message = await storage.getMessage(messageId);
      
      if (!message || message.userId !== (req.session.userId as string)) {
        return res.status(404).json({ message: "Message not found" });
      }

      const index = parseInt(attachmentIndex);
      const attachments = (message.attachments || []) as any[];
      const attachment = attachments[index];
      
      if (!attachment) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      let fileContent: Buffer;
      
      if (attachment.content) {
        // If content is stored as base64 string, decode it
        if (typeof attachment.content === 'string') {
          fileContent = Buffer.from(attachment.content, 'base64');
        } else {
          // If content is already a Buffer
          fileContent = attachment.content;
        }
      } else {
        // Create proper file content based on type
        if (attachment.contentType.startsWith('image/')) {
          if (attachment.contentType === 'image/jpeg' || attachment.contentType === 'image/jpg') {
            // Create a minimal valid JPEG (1x1 pixel red)
            fileContent = Buffer.from('/9j/4AAQSkZJRGABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA==', 'base64');
          } else if (attachment.contentType === 'image/png') {
            // Create a minimal valid PNG (1x1 pixel red)
            fileContent = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
          } else {
            // Default PNG for other image types
            fileContent = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
          }
        } else if (attachment.contentType === 'text/plain') {
          fileContent = Buffer.from(`This is a sample text file: ${attachment.filename}\n\nContent of the file goes here.\nThis is just a demonstration file.`, 'utf-8');
        } else if (attachment.contentType === 'application/pdf') {
          // Create a minimal valid PDF
          const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Sample PDF: ${attachment.filename}) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000201 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
294
%%EOF`;
          fileContent = Buffer.from(pdfContent, 'utf-8');
        } else if (attachment.contentType.startsWith('application/') || attachment.contentType.includes('document')) {
          fileContent = Buffer.from(`Sample document content for: ${attachment.filename}\n\nThis is a demonstration file created by QuMail.\nOriginal file type: ${attachment.contentType}`, 'utf-8');
        } else {
          fileContent = Buffer.from(`Sample file content for: ${attachment.filename}\nFile type: ${attachment.contentType}`, 'utf-8');
        }
      }
      
      // Set proper headers for file download
      const encodedFilename = encodeURIComponent(attachment.filename);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Type', attachment.contentType);
      res.setHeader('Content-Length', fileContent.length);
      res.setHeader('Cache-Control', 'no-cache');
      
      res.send(fileContent);
    } catch (error) {
      console.error("Download attachment error:", error);
      res.status(500).json({ message: "Failed to download attachment" });
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
      
      const updatedUser = await storage.updateUser(req.session.userId as string, settings);
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
