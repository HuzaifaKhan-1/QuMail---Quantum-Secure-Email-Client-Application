import crypto from "crypto";
import { storage } from "../storage";

interface KeyRequest {
  request_id: string;
  key_length_bits: number;
  recipient?: string;
}

interface KeyResponse {
  key_id: string;
  delivery_uri: string;
  status: string;
}

interface KeyMaterial {
  key_id: string;
  key_material: string; // base64 encoded
  timestamp: string;
}

interface KeyPoolStats {
  availableKeys: number;
  totalMB: number;
  remainingMB: number;
  utilizationPercent: number;
}

interface QuantumKeyEntry {
  keyId: string;
  keyMaterial: string; // base64 encoded
  keyLength: number;
  expiryTime: Date;
  consumedBytes: number;
  maxConsumptionBytes: number;
  isActive: boolean;
  createdAt: Date;
}

class KMESimulator {
  private keyStore: Map<string, QuantumKeyEntry> = new Map();
  private readonly KEY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly KEY_EXPIRY_MINUTES = 24 * 60; // 24 hours in minutes
  private readonly POOL_SIZE_TARGET = 10; // Target number of keys in pool
  private readonly DEFAULT_KEY_LENGTH = 8192; // 8KB keys by default
  private readonly MAX_KEY_SIZE_BYTES = 1024 * 1024; // 1MB max key size
  private readonly POOL_SIZE_MB = 100; // 100MB pool size

  constructor() {
    // Initialize with some keys
    this.initializeKeyPool();
  }

  private async initializeKeyPool() {
    console.log("Initializing KME key pool...");
    await this.maintainKeyPool();
    console.log(`Key pool initialized with ${this.keyStore.size} keys`);
  }


  private generateQuantumKey(lengthBits: number): string {
    const lengthBytes = Math.ceil(lengthBits / 8);
    const keyBuffer = crypto.randomBytes(lengthBytes);
    const base64Key = keyBuffer.toString('base64');
    console.log(`Generated quantum key: ${lengthBytes} bytes, base64 length: ${base64Key.length}`);
    return base64Key;
  }

  async requestKey(request: KeyRequest): Promise<KeyResponse> {
    try {
      // Generate quantum key material
      const keyLengthBytes = Math.ceil(request.key_length_bits / 8);
      if (keyLengthBytes > this.MAX_KEY_SIZE_BYTES) {
        throw new Error(`Key size exceeds maximum of ${this.MAX_KEY_SIZE_BYTES} bytes`);
      }

      const quantumKey = this.generateQuantumKey(request.key_length_bits);

      const keyId = `qkey-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

      // Calculate expiry time
      const expiryTime = new Date();
      expiryTime.setMinutes(expiryTime.getMinutes() + this.KEY_EXPIRY_MINUTES);

      // Store the key
      const storedKey: QuantumKeyEntry = {
        keyId,
        keyMaterial: quantumKey, // Ensure this is the base64 encoded key
        keyLength: keyLengthBytes,
        expiryTime: new Date(Date.now() + this.KEY_EXPIRY_MS),
        consumedBytes: 0,
        maxConsumptionBytes: keyLengthBytes,
        isActive: true,
        createdAt: new Date()
      };

      this.keyStore.set(keyId, storedKey);
      console.log(`Stored key ${keyId} with material length: ${quantumKey.length}`);

      // Log the key request
      await storage.createKeyRequest({
        requestId: request.request_id,
        keyLength: keyLengthBytes,
        recipient: request.recipient,
        status: "delivered",
        deliveryUri: `/kme/keys/${keyId}`
      });

      return {
        key_id: keyId,
        delivery_uri: `/kme/keys/${keyId}`,
        status: "delivered"
      };
    } catch (error) {
      console.error("KME request key error:", error);
      throw error;
    }
  }

  async getKey(keyId: string): Promise<KeyMaterial | null> {
    const key = this.keyStore.get(keyId);
    if (!key || key.expiryTime < new Date()) {
      console.log(`Key not found or expired: ${keyId}`);
      return null;
    }

    // Ensure key material is properly formatted
    if (!key.keyMaterial) {
      console.error(`Key material is empty for key: ${keyId}`);
      return null;
    }

    console.log(`Retrieved key ${keyId} for ${key.isActive ? 'active' : 'consumed'} usage`);

    return {
      key_id: keyId,
      key_material: key.keyMaterial, // This should be base64 encoded
      timestamp: new Date().toISOString()
    };
  }

  async acknowledgeKeyUsage(keyId: string, ack: { consumed_bytes: number; message_id?: string }): Promise<boolean> {
    try {
      const key = this.keyStore.get(keyId);

      if (!key) {
        return false;
      }

      const newConsumedBytes = (key.consumedBytes || 0) + ack.consumed_bytes;

      // Update consumed bytes
      key.consumedBytes = newConsumedBytes;
      
      // Keep key available for decryption even if consumed
      // Only mark as inactive if it exceeds maximum usage significantly
      if (newConsumedBytes >= key.maxConsumptionBytes * 2) {
        key.isActive = false;
      }
      
      this.keyStore.set(keyId, key);

      console.log(`Key ${keyId} usage acknowledged: ${newConsumedBytes}/${key.maxConsumptionBytes} bytes consumed`);
      return true;
    } catch (error) {
      console.error("KME acknowledge key usage error:", error);
      return false;
    }
  }

  async getKeyPoolStats(): Promise<KeyPoolStats> {
    try {
      const activeKeys = Array.from(this.keyStore.values()).filter(key => key.isActive);
      const totalKeys = activeKeys.length;

      // Calculate total size used
      const totalSizeBytes = activeKeys.reduce((sum, key) => sum + key.keyLength, 0);
      const totalSizeMB = totalSizeBytes / (1024 * 1024);
      const remainingMB = Math.max(0, this.POOL_SIZE_MB - totalSizeMB);

      return {
        availableKeys: totalKeys,
        totalMB: this.POOL_SIZE_MB,
        remainingMB: Math.round(remainingMB * 100) / 100,
        utilizationPercent: Math.round((totalSizeMB / this.POOL_SIZE_MB) * 100)
      };
    } catch (error) {
      console.error("Get key pool stats error:", error);
      return {
        availableKeys: 0,
        totalMB: this.POOL_SIZE_MB,
        remainingMB: this.POOL_SIZE_MB,
        utilizationPercent: 0
      };
    }
  }

  async maintainKeyPool(): Promise<void> {
    try {
      // Clean up expired keys
      const now = new Date();
      for (const [keyId, key] of this.keyStore.entries()) {
        if (key.expiryTime < now) {
          this.keyStore.delete(keyId);
        }
      }

      // Generate new keys if pool is low
      if (this.keyStore.size < this.POOL_SIZE_TARGET) {
        const keysToAdd = this.POOL_SIZE_TARGET - this.keyStore.size;
        for (let i = 0; i < keysToAdd; i++) {
          // Using default key length if not specified
          await this.requestKey({
            request_id: `maintenance-${Date.now()}-${i}`,
            key_length_bits: this.DEFAULT_KEY_LENGTH
          });
        }
      }
    } catch (error) {
      console.error("Key pool maintenance error:", error);
    }
  }
}

export const kmeSimulator = new KMESimulator();