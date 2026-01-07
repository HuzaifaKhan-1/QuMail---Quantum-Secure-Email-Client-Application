import { SecurityLevel, type User, type InsertMessage } from "@shared/schema";
import { storage } from "../storage";
import { cryptoEngine } from "./cryptoEngine";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
  securityLevel: SecurityLevel;
}

export class EmailService {

  async sendEmail(user: User, options: SendEmailOptions): Promise<void> {
    try {
      // Encrypt email content based on security level
      let encryptedBody: string | null = null;
      let encryptedAttachments: any[] = [];
      let keyId: string | undefined;
      let metadata: Record<string, any> = {};

      if (options.securityLevel !== SecurityLevel.LEVEL4_PLAIN) {
        const bodyEncryption = await cryptoEngine.encrypt(
          options.body,
          options.securityLevel,
          options.to
        );

        encryptedBody = bodyEncryption.encryptedData;
        keyId = bodyEncryption.keyId;
        metadata = bodyEncryption.metadata;

        // Encrypt attachments if present
        if (options.attachments && options.attachments.length > 0) {
          for (const attachment of options.attachments) {
            const encryptedAttachment = await cryptoEngine.encrypt(
              attachment.content,
              options.securityLevel,
              options.to
            );

            encryptedAttachments.push({
              filename: attachment.filename,
              originalSize: attachment.content.length,
              contentType: attachment.contentType,
              encryptedData: encryptedAttachment.encryptedData,
              keyId: encryptedAttachment.keyId
            });
          }
        }
      }

      console.log(`Sending internal QuMail message:`, {
        from: user.email,
        to: options.to,
        subject: options.subject,
        securityLevel: options.securityLevel,
        encrypted: options.securityLevel !== SecurityLevel.LEVEL4_PLAIN,
        keyId: keyId
      });

      // Find recipient user
      const recipient = await storage.getUserByEmail(options.to);
      if (!recipient) {
        throw new Error(`Recipient ${options.to} not found on QuMail platform`);
      }

      const commonMessageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Store message in sender's sent folder (always decrypted for sender)
      await storage.createMessage({
        userId: user.id,
        messageId: commonMessageId,
        from: user.email,
        to: options.to,
        subject: options.subject,
        body: options.body, // Always store original body for sender
        encryptedBody: encryptedBody,
        securityLevel: options.securityLevel,
        keyId,
        isEncrypted: options.securityLevel !== SecurityLevel.LEVEL4_PLAIN,
        isDecrypted: true, // Sender can always see their own messages
        metadata: metadata,
        attachments: options.attachments ? options.attachments.map(a => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.content.length
        })) : null,
        encryptedAttachments: encryptedAttachments.length > 0 ? encryptedAttachments : null,
        folder: "sent",
        isViewed: false
      });

      // Only store in recipient's inbox if sender and recipient are different users
      if (recipient.id !== user.id) {
        await storage.createMessage({
          userId: recipient.id,
          messageId: commonMessageId,
          from: user.email,
          to: options.to,
          subject: options.subject,
          body: options.securityLevel === SecurityLevel.LEVEL4_PLAIN ? options.body : null,
          encryptedBody: encryptedBody,
          securityLevel: options.securityLevel,
          keyId,
          isEncrypted: options.securityLevel !== SecurityLevel.LEVEL4_PLAIN,
          isDecrypted: options.securityLevel === SecurityLevel.LEVEL4_PLAIN,
          metadata: metadata,
          attachments: options.attachments ? options.attachments.map(a => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.content.length
          })) : null,
          encryptedAttachments: encryptedAttachments.length > 0 ? encryptedAttachments : null,
          folder: "inbox",
          isViewed: false
        });
      }

      // Log the email send action
      await storage.createAuditLog({
        userId: user.id,
        action: "email_sent",
        details: {
          to: options.to,
          subject: options.subject,
          securityLevel: options.securityLevel,
          keyId,
          attachmentCount: options.attachments?.length || 0,
          recipientId: recipient.id
        }
      });

      // Only log email received for different users
      if (recipient.id !== user.id) {
        await storage.createAuditLog({
          userId: recipient.id,
          action: "email_received",
          details: {
            from: user.email,
            subject: options.subject,
            securityLevel: options.securityLevel,
            keyId
          }
        });
      }

    } catch (error: any) {
      console.error("Failed to send email:", error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async fetchEmails(user: User, folder = "inbox", limit = 50): Promise<any[]> {
    try {
      // Fetch emails from internal database
      const messages = await storage.getMessagesByUser(user.id, folder, limit);
      return messages;
    } catch (error: any) {
      console.error("Failed to fetch emails:", error);
      throw new Error(`Failed to fetch emails: ${error.message}`);
    }
  }



  async decryptEmail(messageId: string, userId: string): Promise<any> {
    try {
      const message = await storage.getMessage(messageId);

      if (!message || message.userId !== userId) {
        console.error(`Message not found or unauthorized: messageId=${messageId}, userId=${userId}`);
        return { success: false };
      }

      if (!message.isEncrypted || message.isDecrypted) {
        console.log(`Message already decrypted or not encrypted: messageId=${messageId}`);
        return { success: true, decryptedContent: message.body }; 
      }

      if (!message.encryptedBody) {
        console.error(`No encrypted body found for message: messageId=${messageId}`);
        return { success: false };
      }

      const metadata = message.metadata as Record<string, any>;
      console.log(`Decrypting message ${messageId} with metadata:`, metadata);

      const decryptionResult = await cryptoEngine.decrypt(message.encryptedBody, metadata);

      if (decryptionResult.verified) {
        await storage.updateMessage(messageId, {
          body: decryptionResult.decryptedData,
          isDecrypted: true
        });

        await storage.createAuditLog({
          userId,
          action: "email_decrypted",
          details: {
            messageId,
            securityLevel: message.securityLevel,
            keyId: message.keyId
          }
        });

        return {
          success: true,
          decryptedContent: decryptionResult.decryptedData
        };
      }

      return {
        success: false
      };

    } catch (error: any) {
      console.error("Failed to decrypt email:", error);
      return { success: false, error: error.message };
    }
  }
}

export const emailService = new EmailService();