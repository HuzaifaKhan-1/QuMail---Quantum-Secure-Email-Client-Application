
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
  key: string; // base64 encoded
  remaining_usage_count: number;
}

interface KeyPoolStats {
  availableKeys: number;
  totalMB: number;
  remainingMB: number;
  utilizationPercent: number;
}

class KMESimulator {
  private readonly KEY_EXPIRY_MINUTES = 60; // Keys expire in 60 minutes
  private readonly MAX_KEY_SIZE_BYTES = 8192; // 8KB max key size
  private readonly POOL_SIZE_MB = 100; // 100MB key pool

  async requestKey(request: KeyRequest): Promise<KeyResponse> {
    try {
      // Generate quantum key material
      const keyLengthBytes = Math.ceil(request.key_length_bits / 8);
      if (keyLengthBytes > this.MAX_KEY_SIZE_BYTES) {
        throw new Error(`Key size exceeds maximum of ${this.MAX_KEY_SIZE_BYTES} bytes`);
      }

      const keyMaterial = crypto.randomBytes(keyLengthBytes);
      const keyId = `qkey-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
      
      // Calculate expiry time
      const expiryTime = new Date();
      expiryTime.setMinutes(expiryTime.getMinutes() + this.KEY_EXPIRY_MINUTES);

      // Store in database
      await storage.createQuantumKey({
        keyId,
        keyMaterial: keyMaterial.toString('base64'),
        keyLength: keyLengthBytes,
        maxConsumptionBytes: keyLengthBytes,
        expiryTime,
        isActive: true
      });

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
    try {
      const key = await storage.getQuantumKey(keyId);
      
      if (!key || !key.isActive) {
        return null;
      }

      // Check if key has expired
      if (new Date() > new Date(key.expiryTime)) {
        await storage.deactivateQuantumKey(keyId);
        return null;
      }

      // Calculate remaining usage
      const remainingBytes = key.maxConsumptionBytes - (key.consumedBytes || 0);
      const remainingUsageCount = Math.max(0, Math.floor(remainingBytes / 256)); // 256 byte chunks

      return {
        key_id: keyId,
        key: key.keyMaterial || "",
        remaining_usage_count: remainingUsageCount
      };
    } catch (error) {
      console.error("KME get key error:", error);
      return null;
    }
  }

  async acknowledgeKeyUsage(keyId: string, ack: { consumed_bytes: number; message_id?: string }): Promise<boolean> {
    try {
      const key = await storage.getQuantumKey(keyId);
      
      if (!key || !key.isActive) {
        return false;
      }

      const newConsumedBytes = (key.consumedBytes || 0) + ack.consumed_bytes;
      
      // Update consumed bytes
      await storage.updateQuantumKeyUsage(keyId, newConsumedBytes);

      // Deactivate if fully consumed
      if (newConsumedBytes >= key.maxConsumptionBytes) {
        await storage.deactivateQuantumKey(keyId);
      }

      return true;
    } catch (error) {
      console.error("KME acknowledge key usage error:", error);
      return false;
    }
  }

  async getKeyPoolStats(): Promise<KeyPoolStats> {
    try {
      const keys = await storage.getActiveKeys();
      const totalKeys = keys.length;
      
      // Calculate total size used
      const totalSizeBytes = keys.reduce((sum, key) => sum + key.keyLength, 0);
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
      const expiredKeys = await storage.getExpiredKeys();
      for (const key of expiredKeys) {
        await storage.deactivateQuantumKey(key.keyId);
      }

      // Generate new keys if pool is low
      const stats = await this.getKeyPoolStats();
      if (stats.availableKeys < 10) {
        // Generate 5 new keys
        for (let i = 0; i < 5; i++) {
          await this.requestKey({
            request_id: `maintenance-${Date.now()}-${i}`,
            key_length_bits: 4096 * 8 // 4KB keys
          });
        }
      }
    } catch (error) {
      console.error("Key pool maintenance error:", error);
    }
  }
}

export const kmeSimulator = new KMESimulator();
