import mongoose, { Schema, Document } from "mongoose";

// Email Schema
export interface IEmail extends Document {
  senderId: string;
  receiverId: string;
  subject: string;
  encryptedPayload: string;
  securityLevel: number;
  metadata: {
    iv?: string;
    authTag?: string;
    keyId?: string;
    otpKeyId?: string;
    keyExpiryTime?: Date;
    kyberCiphertext?: string;
    publicKeyReference?: string;
  };
  isRead: boolean;
  isEncrypted: boolean;
  createdAt: Date;
}

const EmailSchema: Schema = new Schema({
  senderId: { type: String, required: true },
  receiverId: { type: String, required: true },
  subject: { type: String, required: true },
  encryptedPayload: { type: String, required: true },
  securityLevel: { type: Number, required: true, min: 1, max: 4 },
  metadata: {
    iv: String, // Level 2
    authTag: String, // Level 2
    keyId: String, // Level 2
    otpKeyId: String, // Level 1
    keyExpiryTime: Date, // Level 1
    kyberCiphertext: String, // Level 3
    publicKeyReference: String, // Level 3
  },
  isRead: { type: Boolean, default: false },
  isEncrypted: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// OTP Keys Collection (TEMPORARY – Level 1)
export interface IOTPKey extends Document {
  emailId: mongoose.Types.ObjectId;
  otpKey: string;
  expiresAt: Date;
}

const OTPKeySchema: Schema = new Schema({
  emailId: { type: Schema.Types.ObjectId, ref: 'Email', required: true },
  otpKey: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});

// TTL Index to auto-delete keys after expiry
OTPKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Email = mongoose.model<IEmail>("Email", EmailSchema);
export const OTPKey = mongoose.model<IOTPKey>("OTPKey", OTPKeySchema);
