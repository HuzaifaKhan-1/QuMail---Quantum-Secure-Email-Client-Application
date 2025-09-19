import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { SecurityLevel, type User, type InsertMessage } from "@shared/schema";
import { storage } from "../storage";
import { cryptoEngine } from "./cryptoEngine";
import { getUncachableOutlookClient } from "../outlookClient.ts";

export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  imap: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
}

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
  private getEmailConfig(provider: string, email: string, password: string): EmailConfig {
    switch (provider.toLowerCase()) {
      case "gmail":
        return {
          smtp: {
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: { user: email, pass: password }
          },
          imap: {
            host: "imap.gmail.com", 
            port: 993,
            secure: true,
            auth: { user: email, pass: password }
          }
        };
      case "outlook":
        return {
          smtp: {
            host: "smtp-mail.outlook.com",
            port: 587, 
            secure: false,
            auth: { user: email, pass: password }
          },
          imap: {
            host: "outlook.office365.com",
            port: 993,
            secure: true,
            auth: { user: email, pass: password }
          }
        };
      case "yahoo":
        return {
          smtp: {
            host: "smtp.mail.yahoo.com",
            port: 587,
            secure: false,
            auth: { user: email, pass: password }
          },
          imap: {
            host: "imap.mail.yahoo.com",
            port: 993,
            secure: true,
            auth: { user: email, pass: password }
          }
        };
      default:
        throw new Error(`Unsupported email provider: ${provider}`);
    }
  }

  async sendEmail(user: User, options: SendEmailOptions): Promise<void> {
    try {
      // Encrypt email content based on security level
      let encryptedBody: string;
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
              filename: `${attachment.filename}.qenc`,
              content: Buffer.from(encryptedAttachment.encryptedData, 'base64'),
              contentType: 'application/octet-stream'
            });
          }
        }
      } else {
        encryptedBody = options.body;
        encryptedAttachments = options.attachments || [];
      }

      console.log(`Sending email via ${user.emailProvider}:`, {
        from: user.email,
        to: options.to,
        subject: options.subject,
        securityLevel: options.securityLevel,
        encrypted: options.securityLevel !== SecurityLevel.LEVEL4_PLAIN,
        keyId: keyId
      });

      // Use Outlook Graph API if provider is Outlook and credentials are available
      if (user.emailProvider === 'outlook') {
        try {
          await this.sendViaOutlook(options, encryptedBody, encryptedAttachments, options.securityLevel);
        } catch (error) {
          console.log('Outlook API not configured, falling back to SMTP');
          await this.sendViaSMTP(user, options, encryptedBody, encryptedAttachments, options.securityLevel);
        }
      } else {
        // Send via SMTP for Gmail, Yahoo, and other providers
        await this.sendViaSMTP(user, options, encryptedBody, encryptedAttachments, options.securityLevel);
      }

      // Store message in database
      await storage.createMessage({
        userId: user.id,
        messageId: `sent-${Date.now()}`,
        from: user.email,
        to: options.to,
        subject: options.subject,
        body: options.body,
        encryptedBody: options.securityLevel !== SecurityLevel.LEVEL4_PLAIN ? encryptedBody : null,
        securityLevel: options.securityLevel,
        keyId,
        isEncrypted: options.securityLevel !== SecurityLevel.LEVEL4_PLAIN,
        isDecrypted: true,
        attachments: options.attachments ? options.attachments.map(a => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.content.length
        })) : null,
        folder: "sent"
      });

      // Log the email send action
      await storage.createAuditLog({
        userId: user.id,
        action: "email_sent",
        details: {
          to: options.to,
          subject: options.subject,
          securityLevel: options.securityLevel,
          keyId,
          attachmentCount: options.attachments?.length || 0
        }
      });

    } catch (error) {
      console.error("Failed to send email:", error);
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  private async sendViaOutlook(
    options: SendEmailOptions,
    body: string,
    attachments: any[],
    securityLevel: SecurityLevel
  ): Promise<void> {
    try {
      const client = await getUncachableOutlookClient();
      
      const message = {
        subject: options.subject,
        body: {
          contentType: 'html',
          content: securityLevel !== SecurityLevel.LEVEL4_PLAIN 
            ? `<div>This message is encrypted with QuMail security level: ${securityLevel}</div><pre>${body}</pre>`
            : body
        },
        toRecipients: [
          {
            emailAddress: {
              address: options.to
            }
          }
        ],
        attachments: attachments.map(att => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: att.filename,
          contentBytes: att.content.toString('base64')
        }))
      };

      if (securityLevel !== SecurityLevel.LEVEL4_PLAIN) {
        message.subject = `[${securityLevel.toUpperCase()}] ${options.subject}`;
      }

      await client.api('/me/sendMail').post({
        message
      });

    } catch (error) {
      console.error("Failed to send via Outlook:", error);
      throw error;
    }
  }

  private async sendViaSMTP(
    user: User,
    options: SendEmailOptions,
    body: string,
    attachments: any[],
    securityLevel: SecurityLevel
  ): Promise<void> {
    // For demo purposes, we'll need app-specific passwords for Gmail
    // In production, these should be stored securely in user settings
    const appPassword = process.env.GMAIL_APP_PASSWORD || "";
    
    if (!appPassword && user.emailProvider === 'gmail') {
      throw new Error("Gmail App Password not configured. Please set GMAIL_APP_PASSWORD environment variable.");
    }

    const config = this.getEmailConfig(user.emailProvider, user.email, appPassword);
    const transporter = nodemailer.createTransporter(config.smtp);

    const mailOptions = {
      from: user.email,
      to: options.to,
      subject: securityLevel !== SecurityLevel.LEVEL4_PLAIN 
        ? `[${securityLevel.toUpperCase()}] ${options.subject}`
        : options.subject,
      html: securityLevel !== SecurityLevel.LEVEL4_PLAIN
        ? `<div style="font-family: Arial, sans-serif;">
             <div style="background: #f0f0f0; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
               <strong>🔐 QuMail Encrypted Message</strong><br>
               Security Level: ${securityLevel.toUpperCase()}
             </div>
             <div style="background: #fafafa; padding: 15px; border-left: 4px solid #007bff;">
               ${body.replace(/\n/g, '<br>')}
             </div>
           </div>`
        : body.replace(/\n/g, '<br>'),
      text: securityLevel !== SecurityLevel.LEVEL4_PLAIN
        ? `🔐 QuMail Encrypted Message\nSecurity Level: ${securityLevel.toUpperCase()}\n\n${body}`
        : body,
      headers: {
        'X-QuMail-Security': securityLevel,
        'X-QuMail-Version': '1.0'
      },
      attachments
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully via SMTP to ${options.to}`);
  }

  async fetchEmails(user: User, folder = "INBOX", limit = 50): Promise<any[]> {
    try {
      if (user.emailProvider === 'outlook') {
        return await this.fetchViaOutlook(folder, limit);
      } else {
        return await this.fetchViaIMAP(user, folder, limit);
      }
    } catch (error) {
      console.error("Failed to fetch emails:", error);
      throw new Error(`Failed to fetch emails: ${error}`);
    }
  }

  private async fetchViaOutlook(folder: string, limit: number): Promise<any[]> {
    try {
      const client = await getUncachableOutlookClient();
      
      const messages = await client
        .api('/me/mailFolders/inbox/messages')
        .top(limit)
        .orderby('receivedDateTime desc')
        .get();

      return messages.value.map((msg: any) => ({
        id: msg.id,
        messageId: msg.internetMessageId,
        from: msg.from?.emailAddress?.address || '',
        to: msg.toRecipients?.[0]?.emailAddress?.address || '',
        subject: msg.subject || '',
        body: msg.body?.content || '',
        receivedAt: new Date(msg.receivedDateTime),
        hasAttachments: msg.hasAttachments,
        isRead: msg.isRead,
        securityLevel: this.extractSecurityLevel(msg.subject),
        isEncrypted: this.isQuMailEncrypted(msg.subject, msg.body?.content)
      }));

    } catch (error) {
      console.error("Failed to fetch via Outlook:", error);
      return [];
    }
  }

  private async fetchViaIMAP(user: User, folder: string, limit: number): Promise<any[]> {
    // IMAP integration would require user credentials - simplified for demo
    // In production, this would connect to user's actual IMAP server
    console.log(`Would fetch ${limit} emails from ${folder} for ${user.email} via ${user.emailProvider}`);
    
    // Return sample data for demo purposes
    return [
      {
        id: "demo-1",
        messageId: "demo-message-1",
        from: "demo@example.com",
        to: user.email,
        subject: "[LEVEL1] Welcome to QuMail",
        body: "This is a demo encrypted message",
        receivedAt: new Date(),
        hasAttachments: false,
        isRead: false,
        securityLevel: this.extractSecurityLevel("[LEVEL1] Welcome to QuMail"),
        isEncrypted: true
      }
    ];
  }

  private extractSecurityLevel(subject: string): SecurityLevel {
    if (subject.includes('[LEVEL1]')) return SecurityLevel.LEVEL1_OTP;
    if (subject.includes('[LEVEL2]')) return SecurityLevel.LEVEL2_AES;
    if (subject.includes('[LEVEL3]')) return SecurityLevel.LEVEL3_PQC;
    return SecurityLevel.LEVEL4_PLAIN;
  }

  private isQuMailEncrypted(subject: string, body: string): boolean {
    return subject.includes('[LEVEL') || 
           body.includes('QuMail security level') ||
           body.includes('encrypted with QuMail');
  }

  async decryptEmail(messageId: string, userId: string): Promise<boolean> {
    try {
      const message = await storage.getMessage(messageId);
      if (!message || message.userId !== userId) {
        return false;
      }

      if (!message.isEncrypted || message.isDecrypted || !message.encryptedBody) {
        return true; // Already decrypted or not encrypted
      }

      // Parse metadata to get decryption parameters
      const metadata = {
        securityLevel: message.securityLevel,
        keyId: message.keyId
      };

      const decryptionResult = await cryptoEngine.decrypt(
        message.encryptedBody,
        metadata
      );

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

        return true;
      }

      return false;

    } catch (error) {
      console.error("Failed to decrypt email:", error);
      return false;
    }
  }
}

export const emailService = new EmailService();
