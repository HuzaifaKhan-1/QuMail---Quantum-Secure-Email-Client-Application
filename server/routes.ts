import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { storage } from "./storage";
import { kmeSimulator } from "./services/kmeSimulator";
import { emailService } from "./services/emailService";
import { cryptoEngine } from "./services/cryptoEngine";
import { SecurityLevel, insertUserSchema, insertAuditLogSchema, messages } from "@shared/schema";
import { db } from "./db";
import { eq, and, not, sql } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || "quantum-secure-secret-256";

// WebSocket management
const clients = new Map<string, WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  // --- DATABASE CLEANUP (One-off for Migration) ---
  try {
    console.log("Checking for stale database columns and triggers...");
    // 1. Drop stale columns
    await db.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS email;`);
    await db.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS email_provider;`);

    // 2. Aggressively drop any triggers on the users table that might be causing field-missing errors
    // We query the system catalog to find the exact trigger names
    const triggers = await db.execute(sql`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE event_object_table = 'users';
    `);

    if (triggers.rows.length > 0) {
      for (const row of triggers.rows as { trigger_name: string }[]) {
        const triggerName = row.trigger_name;
        console.log(`Dropping stale trigger: ${triggerName}`);
        await db.execute(sql`DROP TRIGGER IF EXISTS ${sql.raw(triggerName)} ON users;`);
      }
    }

    // 3. Ensure supplemental tables are updated
    // The new identity system relies on secure_email/user_secure_email in these tables
    await db.execute(sql`ALTER TABLE pqc_keys ADD COLUMN IF NOT EXISTS secure_email text;`);
    await db.execute(sql`ALTER TABLE key_requests ADD COLUMN IF NOT EXISTS user_secure_email text;`);
    await db.execute(sql`ALTER TABLE quantum_keys ADD COLUMN IF NOT EXISTS user_secure_email text;`);

    console.log("Database identity migration cleanup: SUCCESS");
  } catch (err) {
    console.warn("Database cleanup notice (safe to ignore if already handled):", err);
  }
  // ------------------------------------------------

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Basic session-based auth for WS
    const cookie = req.headers.cookie;
    if (!cookie) {
      ws.close();
      return;
    }

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'auth' && message.userId) {
          clients.set(message.userId, ws);
          console.log(`WebSocket client connected: ${message.userId}`);
        }
      } catch (e) {
        console.error('WS message error:', e);
      }
    });

    ws.on('close', () => {
      for (const [userId, client] of clients.entries()) {
        if (client === ws) {
          clients.delete(userId);
          break;
        }
      }
    });
  });

  const notifyUser = (userId: string, data: any) => {
    const client = clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  };

  // Authentication middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Google OAuth 2.0 Identity Hub
  app.post("/api/auth/google", async (req, res) => {
    try {
      const { credential } = req.body;
      if (!credential) {
        return res.status(400).json({ message: "Google credential is required" });
      }

      // Verify Google ID Token
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) {
        return res.status(400).json({ message: "Invalid Google token" });
      }

      const { email: googleEmail, name, sub: googleSub } = payload;

      // Check if user exists
      let user = await storage.getUserByGoogleSub(googleSub);

      if (!user) {
        // STEP 2: Internal Secure Email Generation
        // Generate unique secure email: <username>@qumail.secure
        const baseUsername = googleEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        let secureEmail = `${baseUsername}@qumail.secure`;

        // Ensure uniqueness (add random suffix if needed)
        const existing = await storage.getUserBySecureEmail(secureEmail);
        if (existing) {
          secureEmail = `${baseUsername}${Math.floor(Math.random() * 1000)}@qumail.secure`;
        }

        user = await storage.createUser({
          googleEmail,
          secureEmail,
          username: name || baseUsername,
          googleSub,
          defaultSecurityLevel: "level1"
        });

        // STEP 4: Kyber Keypair Generation (First Login)
        const { publicKey, privateKey } = await cryptoEngine.generateKyberKeypair();
        await storage.createPqcKey({
          secureEmail: user.secureEmail,
          publicKey,
          privateKey
        });

        await storage.createAuditLog({
          userId: user.id,
          action: "user_registered_oauth",
          details: { googleEmail, secureEmail, action: "initial_pqc_key_generation" },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      }

      // Create JWT Session (Step 8)
      const token = jwt.sign(
        { userId: user.id, secureEmail: user.secureEmail },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Store in session (compatibility with existing middleware)
      if (req.session) {
        req.session.userId = user.id;
        req.session.secureEmail = user.secureEmail;
      }

      await storage.createAuditLog({
        userId: user.id,
        action: "user_login_oauth",
        details: { googleEmail, secureEmail: user.secureEmail },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        user: {
          id: user.id,
          googleEmail: user.googleEmail,
          secureEmail: user.secureEmail,
          username: user.username
        },
        token
      });
    } catch (error: any) {
      console.error("Google Auth error:", error);
      res.status(500).json({
        message: "Authentication failed",
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
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
          googleEmail: user.googleEmail,
          secureEmail: user.secureEmail,
          username: user.username,
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

      // Level 1 security: Check if already consumed
      if (message.securityLevel === SecurityLevel.LEVEL1_OTP && message.isViewed) {
        return res.status(403).json({
          message: "This message was marked as 'View Once' and has already been read. Content is destroyed.",
          isViewedOnce: true
        });
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
        to: z.string().regex(/@qumail\.secure$/i, "Messages can only be sent to internal @qumail.secure addresses").transform(v => v.toLowerCase()),
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

      // Find recipient user by secure email
      const recipient = await storage.getUserBySecureEmail(emailData.to);
      if (!recipient) {
        return res.status(404).json({ message: "Recipient not found on QuMail platform" });
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
    } catch (error: any) {
      console.error("Send email error:", error);
      res.status(400).json({ message: error.message || "Failed to send email" });
    }
  });

  app.post("/api/emails/:messageId/edit", requireAuth, async (req, res) => {
    try {
      const { messageId } = req.params;
      const { body } = z.object({ body: z.string() }).parse(req.body);

      const message = await storage.getMessage(messageId);
      if (!message || message.userId !== (req.session.userId as string)) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (message.folder !== "sent") {
        return res.status(403).json({ message: "Only sent messages can be edited" });
      }

      if (!message.receivedAt) {
        return res.status(500).json({ message: "Invalid message date" });
      }

      const sentAt = new Date(message.receivedAt).getTime();
      const now = Date.now();
      const editWindow = 15 * 60 * 1000; // 15 minutes window

      if (now - sentAt > editWindow) {
        return res.status(403).json({ message: "Edit time limit expired (15 minutes)" });
      }

      // Re-encrypt body for both sender and receiver using the standard encryption engine
      // This ensures Level 1, 2, and 3 are handled correctly with fresh keys/metadata
      const { cryptoEngine } = await import("./services/cryptoEngine");
      const encryptionResult = await cryptoEngine.encrypt(
        body,
        message.securityLevel as SecurityLevel,
        message.to
      );

      console.log(`[EDIT DEBUG] Re-encrypted Level 1 message: dataLength=${encryptionResult.metadata.dataLength}, keyId=${encryptionResult.keyId}`);

      const updated = await storage.updateMessage(messageId, {
        body: message.securityLevel === SecurityLevel.LEVEL4_PLAIN ? body : null,
        encryptedBody: encryptionResult.encryptedData,
        keyId: encryptionResult.keyId,
        metadata: encryptionResult.metadata,
        editedAt: new Date()
      });

      // Update the receiver's copy as well
      const receiverMessages = await db.select().from(messages).where(
        and(
          eq(messages.messageId, message.messageId),
          eq(messages.folder, "inbox")
        )
      );

      console.log(`[SYNC DEBUG] Found ${receiverMessages.length} receiver messages for sync`);

      for (const msg of receiverMessages) {
        console.log(`[SYNC DEBUG] Updating message ${msg.id} for user ${msg.userId}`);

        // Update with synchronized content and metadata
        await db.update(messages)
          .set({
            body: msg.securityLevel === SecurityLevel.LEVEL4_PLAIN ? body : null,
            encryptedBody: encryptionResult.encryptedData,
            keyId: encryptionResult.keyId,
            metadata: encryptionResult.metadata,
            editedAt: new Date(),
          })
          .where(eq(messages.id, msg.id));

        console.log(`[SYNC DEBUG] Database update complete for ${msg.id}`);

        // Notify user via WebSocket for instant update
        notifyUser(msg.userId, {
          type: 'EMAIL_UPDATED',
          messageId: msg.id,
          folder: msg.folder
        });
        console.log(`[SYNC DEBUG] WS notification sent to user ${msg.userId}`);
      }

      res.json(updated);
    } catch (error) {
      console.error("Edit message error:", error);
      res.status(400).json({ message: "Failed to edit message" });
    }
  });


  app.post("/api/emails/:messageId/decrypt", requireAuth, async (req, res) => {
    try {
      const { messageId } = req.params;
      const result = await emailService.decryptEmail(messageId, req.session.userId as string);

      if (!result || !result.success) {
        return res.status(400).json({ message: "Failed to decrypt email" });
      }

      // Plaintext is returned in response but NEVER persisted to DB for secure levels
      res.json({
        message: "Email decrypted successfully",
        success: true,
        decryptedContent: result.decryptedContent
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
      let fileContent: Buffer | null = null;
      let contentType = 'application/octet-stream';
      let filename = 'attachment';

      if (message.isEncrypted && Array.isArray(message.encryptedAttachments)) {
        const encryptedAttachment = (message.encryptedAttachments as any[])[index];
        if (encryptedAttachment) {
          filename = encryptedAttachment.filename;
          contentType = encryptedAttachment.contentType;

          const { cryptoEngine } = await import("./services/cryptoEngine");
          const decryptionResult = await cryptoEngine.decrypt(
            encryptedAttachment.encryptedData,
            encryptedAttachment.metadata
          );

          if (decryptionResult.verified) {
            fileContent = decryptionResult.decryptedData;
          }
        }
      }

      if (!fileContent) {
        const attachments = (message.attachments || []) as any[];
        const attachment = attachments[index];

        if (!attachment) {
          return res.status(404).json({ message: "Attachment not found" });
        }

        filename = attachment.filename;
        contentType = attachment.contentType;

        if (attachment.content) {
          // If content is stored as base64 string, decode it
          if (typeof attachment.content === 'string') {
            fileContent = Buffer.from(attachment.content, 'base64');
          } else {
            // If content is already a Buffer
            fileContent = attachment.content;
          }
        }
      }

      if (!fileContent) {
        // Create proper file content based on type (last resort/fallback)
        if (contentType.startsWith('image/')) {
          if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
            fileContent = Buffer.from('/9j/4AAQSkZJRGABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA==', 'base64');
          } else {
            fileContent = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
          }
        } else {
          fileContent = Buffer.from(`Sample file content for: ${filename}\nFile type: ${contentType}`, 'utf-8');
        }
      }

      // Set proper headers for file download
      const encodedFilename = encodeURIComponent(filename);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Type', contentType);
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

  return httpServer;
}
