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
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || "quantum-secure-secret-256";

// Security helper: Password hashing without dependencies
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

function verifyPassword(password: string, hash: string): boolean {
  try {
    const [salt, key] = hash.split(":");
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = scryptSync(password, salt, 64);
    return timingSafeEqual(keyBuffer, derivedKey);
  } catch (e) {
    return false;
  }
}

// WebSocket management
const clients = new Map<string, WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  // --- DATABASE CLEANUP (One-off for Migration) ---
  try {
    console.log("Checking for hybrid authentication database columns...");
    // 1. Check for column existence
    const existingColumns = await db.execute(sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
    `);
    const columnNames = (existingColumns.rows as { column_name: string }[]).map(r => r.column_name);

    // 2. Handle secure_email -> user_secure_email transition
    if (columnNames.includes('secure_email')) {
      if (columnNames.includes('user_secure_email')) {
        console.log("Both secure_email and user_secure_email exist. Dropping stale secure_email...");
        await db.execute(sql`ALTER TABLE users DROP COLUMN secure_email;`);
      } else {
        console.log("Renaming secure_email to user_secure_email...");
        await db.execute(sql`ALTER TABLE users RENAME COLUMN secure_email TO user_secure_email;`);
        columnNames.push('user_secure_email');
      }
    }

    // 3. Ensure all new columns exist
    const newColumns = [
      { name: 'google_email', type: 'TEXT' },
      { name: 'google_sub', type: 'TEXT' },
      { name: 'user_secure_email', type: 'TEXT' },
      { name: 'password_hash', type: 'TEXT' },
      { name: 'is_verified', type: 'BOOLEAN DEFAULT true' },
      { name: 'auth_provider', type: 'TEXT DEFAULT \'google\'' }
    ];

    for (const col of newColumns) {
      if (!columnNames.includes(col.name)) {
        console.log(`Adding column: ${col.name}`);
        await db.execute(sql.raw(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type};`));
      }
    }

    // 3. Drop stale columns
    await db.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS email;`);
    await db.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS email_provider;`);

    // 4. Update Supplemental Tables
    const tablesToUpdate = ['pqc_keys', 'key_requests', 'quantum_keys'];
    for (const table of tablesToUpdate) {
      const tableCols = await db.execute(sql.raw(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}';`));
      const tableColNames = (tableCols.rows as { column_name: string }[]).map(r => r.column_name);

      if (tableColNames.includes('secure_email')) {
        if (tableColNames.includes('user_secure_email')) {
          await db.execute(sql.raw(`ALTER TABLE ${table} DROP COLUMN secure_email;`));
        } else {
          await db.execute(sql.raw(`ALTER TABLE ${table} RENAME COLUMN secure_email TO user_secure_email;`));
          tableColNames.push('user_secure_email');
        }
      }

      if (!tableColNames.includes('user_secure_email')) {
        await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN user_secure_email TEXT;`));
      }
    }

    // 5. Aggressively drop any triggers on the users table that might be causing field-missing errors
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

    console.log("Database identity migration: SUCCESS");
  } catch (err) {
    console.warn("Database migration notice:", err);
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

  // Hybrid Authentication Identity Hub (Google OAuth for Verification)
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
        const baseUsername = googleEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        let userSecureEmail = `${baseUsername}@qumail.secure`;

        // Ensure uniqueness
        const existing = await storage.getUserBySecureEmail(userSecureEmail);
        if (existing) {
          userSecureEmail = `${baseUsername}${Math.floor(Math.random() * 1000)}@qumail.secure`;
        }

        user = await storage.createUser({
          googleEmail,
          userSecureEmail,
          username: name || baseUsername,
          googleSub,
          authProvider: 'google',
          isVerified: true,
          defaultSecurityLevel: "level1"
        });

        // STEP 4: Kyber Keypair Generation (First Login)
        const { publicKey, privateKey } = await cryptoEngine.generateKyberKeypair();
        await storage.createPqcKey({
          userSecureEmail: user.userSecureEmail,
          publicKey,
          privateKey
        });

        await storage.createAuditLog({
          userId: user.id,
          action: "user_registered_oauth",
          details: { googleEmail, userSecureEmail: user.userSecureEmail, action: "initial_pqc_key_generation" },
          ipAddress: req.ip as string || "0.0.0.0",
          userAgent: req.get('User-Agent') || "unknown"
        });
      }

      // Generate JWT Session
      const token = jwt.sign(
        {
          userId: user.id,
          userSecureEmail: user.userSecureEmail,
          googleEmail: user.googleEmail
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Store in session for compatibility
      if (req.session) {
        req.session.userId = user.id;
        req.session.userSecureEmail = user.userSecureEmail;
      }

      await storage.createAuditLog({
        userId: user.id,
        action: "user_login_oauth",
        details: { googleEmail, userSecureEmail: user.userSecureEmail },
        ipAddress: req.ip as string || "0.0.0.0",
        userAgent: req.get('User-Agent') || "unknown"
      });

      res.json({
        user: {
          id: user.id,
          googleEmail: user.googleEmail,
          userSecureEmail: user.userSecureEmail,
          username: user.username,
          needsPassword: !user.passwordHash
        },
        token
      });
    } catch (error: any) {
      console.error("Google Auth error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      res.status(500).json({
        message: "Authentication failed",
        error: error.message
      });
    }
  });

  // New Route: Set Secure Password
  app.post("/api/auth/set-password", requireAuth, async (req, res) => {
    try {
      const { password } = z.object({ password: z.string().min(8) }).parse(req.body);
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const passwordHash = hashPassword(password);
      await storage.updateUser(userId, { passwordHash });

      await storage.createAuditLog({
        userId: userId as string,
        action: "password_set",
        details: { userSecureEmail: user.userSecureEmail },
        ipAddress: req.ip as string || "0.0.0.0",
        userAgent: req.get('User-Agent') || "unknown"
      });

      res.json({ message: "Password set successfully" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Password does not meet security requirements" });
      }
      res.status(400).json({ message: error.message || "Failed to set password" });
    }
  });

  // New Route: Password-based Login (Daily Login)
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { userSecureEmail, password } = z.object({
        userSecureEmail: z.string().regex(/@qumail\.secure$/i),
        password: z.string()
      }).parse(req.body);

      const user = await storage.getUserBySecureEmail(userSecureEmail.toLowerCase());
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValid = verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Generate JWT Session
      const token = jwt.sign(
        {
          userId: user.id,
          userSecureEmail: user.userSecureEmail,
          googleEmail: user.googleEmail
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      if (req.session) {
        req.session.userId = user.id;
        req.session.userSecureEmail = user.userSecureEmail;
      }

      await storage.createAuditLog({
        userId: user.id,
        action: "user_login_password",
        details: { userSecureEmail: user.userSecureEmail },
        ipAddress: req.ip as string || "0.0.0.0",
        userAgent: req.get('User-Agent') || "unknown"
      });

      res.json({
        user: {
          id: user.id,
          googleEmail: user.googleEmail,
          userSecureEmail: user.userSecureEmail,
          username: user.username
        },
        token
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation failed",
          errors: error.errors.map(e => ({ path: e.path, message: e.message }))
        });
      }
      res.status(400).json({ message: error.message || "Login failed" });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    const userId = req.session?.userId as string;

    await storage.createAuditLog({
      userId,
      action: "user_logout",
      details: {},
      ipAddress: req.ip as string || "0.0.0.0",
      userAgent: req.get('User-Agent') || "unknown"
    });

    req.session?.destroy(() => {
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session?.userId as string);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        user: {
          id: user.id,
          googleEmail: user.googleEmail,
          userSecureEmail: user.userSecureEmail,
          username: user.username,
          defaultSecurityLevel: user.defaultSecurityLevel,
          needsPassword: !user.passwordHash
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
        status: z.enum(["consumed", "expired"])
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
        recipient,
        userSecureEmail: req.session?.userSecureEmail
      };

      const response = await kmeSimulator.requestKey(keyRequest);

      await storage.createAuditLog({
        userId: req.session?.userId as string,
        action: "key_requested",
        details: { keyId: response.key_id, keyLength, userSecureEmail: req.session?.userSecureEmail },
        ipAddress: req.ip as string || "0.0.0.0",
        userAgent: req.get('User-Agent') || "unknown"
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
      const messages = await storage.getMessagesByUser(req.session?.userId as string, folder);

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

      if (!message || message.userId !== (req.session?.userId as string)) {
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
      const user = await storage.getUser(req.session?.userId as string);

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
      if (!message || message.userId !== (req.session?.userId as string)) {
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

      // Re-encrypt body
      const encryptionResult = await cryptoEngine.encrypt(
        body,
        message.securityLevel as SecurityLevel,
        message.to,
        message.senderSecureEmail as string
      );

      const updated = await storage.updateMessage(messageId, {
        body: message.securityLevel === SecurityLevel.LEVEL4_PLAIN ? body : null,
        encryptedBody: encryptionResult.encryptedData,
        keyId: encryptionResult.keyId,
        metadata: encryptionResult.metadata,
        editedAt: new Date()
      });

      // Synchronize with recipient
      const receiverMessages = await db.select().from(messages).where(
        and(
          eq(messages.messageId, message.messageId as string),
          eq(messages.folder, "inbox")
        )
      );

      for (const msg of receiverMessages) {
        await db.update(messages)
          .set({
            body: msg.securityLevel === SecurityLevel.LEVEL4_PLAIN ? body : null,
            encryptedBody: encryptionResult.encryptedData,
            keyId: encryptionResult.keyId,
            metadata: encryptionResult.metadata,
            editedAt: new Date(),
          })
          .where(eq(messages.id, msg.id));

        notifyUser(msg.userId, {
          type: 'EMAIL_UPDATED',
          messageId: msg.id,
          folder: msg.folder
        });
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
      const result = await emailService.decryptEmail(messageId, req.session?.userId as string);

      if (!result || !result.success) {
        return res.status(400).json({ message: "Failed to decrypt email" });
      }

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

      if (!message || message.userId !== (req.session?.userId as string)) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (message.securityLevel === SecurityLevel.LEVEL1_OTP) {
        await storage.updateMessage(messageId, {
          body: null,
          encryptedBody: null
        });

        await storage.createAuditLog({
          userId: req.session?.userId as string,
          action: "email_content_purged",
          details: { messageId },
          ipAddress: req.ip as string || "0.0.0.0",
          userAgent: req.get('User-Agent') || "unknown"
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

      if (!message || message.userId !== (req.session?.userId as string)) {
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
          if (typeof attachment.content === 'string') {
            fileContent = Buffer.from(attachment.content, 'base64');
          } else {
            fileContent = attachment.content;
          }
        }
      }

      if (!fileContent) {
        fileContent = Buffer.from(`Sample file content for: ${filename}\nFile type: ${contentType}`, 'utf-8');
      }

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileContent.length);
      res.send(fileContent);
    } catch (error) {
      console.error("Download attachment error:", error);
      res.status(500).json({ message: "Failed to download attachment" });
    }
  });

  app.get("/api/audit", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getAuditLogs(req.session?.userId as string, limit);
      res.json(logs);
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  app.put("/api/user/settings", requireAuth, async (req, res) => {
    try {
      const settingsSchema = z.object({
        defaultSecurityLevel: z.nativeEnum(SecurityLevel).optional(),
        smtpConfig: z.object({}).optional(),
        imapConfig: z.object({}).optional()
      });

      const settings = settingsSchema.parse(req.body);

      const updatedUser = await storage.updateUser(req.session?.userId as string, settings);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.createAuditLog({
        userId: req.session?.userId as string,
        action: "settings_updated",
        details: settings,
        ipAddress: req.ip as string || "0.0.0.0",
        userAgent: req.get('User-Agent') || "unknown"
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
