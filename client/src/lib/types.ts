export interface User {
  id: string;
  email: string;
  username: string;
  emailProvider?: string;
  defaultSecurityLevel?: string;
}

export interface Message {
  id: string;
  userId: string;
  messageId: string;
  from: string;
  to: string;
  subject: string;
  body?: string;
  encryptedBody?: string;
  securityLevel: SecurityLevel;
  keyId?: string;
  isEncrypted: boolean;
  isDecrypted: boolean;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
  encryptedAttachments?: Array<{
    filename: string;
    originalSize: number;
    contentType: string;
    encryptedData: string;
    keyId?: string;
  }>;
  receivedAt: string;
  folder: string;
  isViewed: boolean;
  editedAt?: string;
  metadata?: {
    editNotification?: string;
    lastEditedBy?: string;
    [key: string]: any;
  };
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface QuantumKey {
  id: string;
  keyId: string;
  keyLength: number;
  consumedBytes: number;
  maxConsumptionBytes: number;
  utilizationPercent: number;
  expiryTime: string;
  isActive: boolean;
  createdAt: string;
}

export interface KeyPoolStats {
  totalKeys: number;
  totalCapacityMB: number;
  consumedMB: number;
  remainingMB: number;
  utilizationPercent: number;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export enum SecurityLevel {
  LEVEL1_OTP = "level1",
  LEVEL2_AES = "level2",
  LEVEL3_PQC = "level3", 
  LEVEL4_PLAIN = "level4"
}

export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  securityLevel: SecurityLevel;
  attachments?: {
    filename: string;
    content: string; // base64
    contentType: string;
  }[];
}