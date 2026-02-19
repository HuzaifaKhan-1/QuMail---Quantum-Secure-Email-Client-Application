import crypto from "crypto";
import { storage } from "../storage";

interface KeyRequest {
  request_id: string;
  key_length_bits: number;
  recipient?: string;
  userSecureEmail?: string;
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
  userSecureEmail?: string;
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
  userSecureEmail?: string;
}

interface QuantumKeyMaterial {
  key_id: string;
  key_material: string;
  key_length_bits: number;
  expiry_time: number; // Unix timestamp in seconds
  consumed_bytes: number;
  isActive?: boolean;
  userSecureEmail?: string;
}


class KMESimulator {
  private keyPool: Map<string, QuantumKeyMaterial> = new Map();
  private keyStore: Map<string, QuantumKeyEntry> = new Map();
  private keyPoolStats = {
    availableKeys: 0,
    totalMB: 0,
    remainingMB: 0,
    utilizationPercent: 0
  };

  private readonly KEY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly KEY_EXPIRY_MINUTES = 24 * 60; // 24 hours in minutes
  private readonly POOL_SIZE_TARGET = 10; // Target number of keys in pool
  private readonly DEFAULT_KEY_LENGTH = 8192; // 8KB keys by default
  private readonly MAX_KEY_SIZE_BYTES = 1024 * 1024; // 1MB max key size
  private readonly POOL_SIZE_MB = 100; // 100MB pool size

  constructor() {
    this.initializeKeyPool();
  }

  private async initializeKeyPool() {
    console.log("Initializing KME key pool...");

    // Load existing keys from storage first
    await this.loadExistingKeys();

    // Generate additional keys if needed
    const currentPoolSize = this.keyPool.size;
    const targetPoolSize = 10;

    if (currentPoolSize < targetPoolSize) {
      const keysToGenerate = targetPoolSize - currentPoolSize;
      for (let i = 0; i < keysToGenerate; i++) {
        await this.generateAndStoreQuantumKey();
      }
    }

    this.updateKeyPoolStats();
    console.log(`Key pool initialized with ${this.keyPool.size} keys`);
  }

  private async loadExistingKeys() {
    try {
      const storage = (await import('../storage')).storage;
      const existingKeys = await storage.getActiveKeys();

      for (const key of existingKeys) {
        if (key.keyMaterial) {
          this.keyPool.set(key.keyId, {
            key_id: key.keyId,
            key_material: key.keyMaterial,
            key_length_bits: key.keyLength * 8,
            expiry_time: Math.floor(key.expiryTime.getTime() / 1000),
            consumed_bytes: key.consumedBytes || 0,
            userSecureEmail: key.userSecureEmail || undefined
          });
        }
      }

      console.log(`Loaded ${existingKeys.length} existing keys from storage`);
    } catch (error) {
      console.log("No existing keys found, starting fresh");
    }
  }


  private generateQuantumKey(lengthBits: number = this.DEFAULT_KEY_LENGTH): string {
    const lengthBytes = Math.ceil(lengthBits / 8);
    const keyBuffer = crypto.randomBytes(lengthBytes);
    const base64Key = keyBuffer.toString('base64');
    console.log(`Generated quantum key: ${lengthBytes} bytes, base64 length: ${base64Key.length}`);
    return base64Key;
  }

  async requestKey(request: KeyRequest): Promise<KeyResponse> {
    try {
      // Generate quantum key material
      const keyLengthBits = request.key_length_bits || this.DEFAULT_KEY_LENGTH;
      const keyLengthBytes = Math.ceil(keyLengthBits / 8);

      if (keyLengthBytes > this.MAX_KEY_SIZE_BYTES) {
        throw new Error(`Key size exceeds maximum of ${this.MAX_KEY_SIZE_BYTES} bytes`);
      }

      const quantumKeyMaterial = this.generateQuantumKey(keyLengthBits);
      const keyId = `qkey-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
      const expiryDate = new Date(Date.now() + this.KEY_EXPIRY_MS);

      const storedKey: QuantumKeyEntry = {
        keyId,
        keyMaterial: quantumKeyMaterial,
        keyLength: keyLengthBytes,
        expiryTime: expiryDate,
        consumedBytes: 0,
        maxConsumptionBytes: keyLengthBytes,
        isActive: true,
        createdAt: new Date(),
        userSecureEmail: request.userSecureEmail
      };

      // Add to all memory caches immediately
      this.keyStore.set(keyId, storedKey);
      this.keyPool.set(keyId, {
        key_id: keyId,
        key_material: quantumKeyMaterial,
        key_length_bits: keyLengthBits,
        expiry_time: Math.floor(expiryDate.getTime() / 1000),
        consumed_bytes: 0,
        userSecureEmail: request.userSecureEmail
      });

      console.log(`Stored key ${keyId} with material length: ${quantumKeyMaterial.length} for ${request.userSecureEmail}`);

      // Persist the key to storage
      await storage.createQuantumKey({
        keyId,
        keyMaterial: quantumKeyMaterial,
        keyLength: keyLengthBytes,
        expiryTime: expiryDate,
        consumedBytes: 0,
        maxConsumptionBytes: keyLengthBytes,
        isActive: true,
        userSecureEmail: request.userSecureEmail
      });

      // Log the key request
      await storage.createKeyRequest({
        requestId: request.request_id,
        keyLength: keyLengthBytes,
        recipient: request.recipient,
        userSecureEmail: request.userSecureEmail,
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

  async getKey(keyId: string): Promise<QuantumKeyMaterial | null> {
    // 1. Check current pool
    let key = this.keyPool.get(keyId);

    // 2. Check key store if not in pool
    if (!key) {
      const entry = this.keyStore.get(keyId);
      if (entry) {
        key = {
          key_id: entry.keyId,
          key_material: entry.keyMaterial,
          key_length_bits: entry.keyLength * 8,
          expiry_time: Math.floor(entry.expiryTime.getTime() / 1000),
          consumed_bytes: entry.consumedBytes || 0
        };
        this.keyPool.set(keyId, key);
      }
    }

    if (!key) {
      try {
        const { storage } = await import('../storage');
        const storedKey = await storage.getQuantumKey(keyId);

        if (storedKey && storedKey.keyMaterial) {
          key = {
            key_id: storedKey.keyId,
            key_material: storedKey.keyMaterial,
            key_length_bits: storedKey.keyLength * 8,
            expiry_time: Math.floor(storedKey.expiryTime.getTime() / 1000),
            consumed_bytes: storedKey.consumedBytes || 0
          };

          this.keyPool.set(keyId, key);
          console.log(`[KME DEBUG] Loaded key from storage: ${keyId}, material length: ${key.key_material.length}`);
        }
      } catch (error) {
        console.error(`[KME ERROR] Failed to load key from storage: ${keyId}`, error);
      }
    }

    if (key) {
      const buf = Buffer.from(key.key_material, 'base64');
      console.log(`[KME DEBUG] Returning key ${keyId}: base64Length=${key.key_material.length}, bufferLength=${buf.length}, requestedBits=${key.key_length_bits}`);
    }

    if (!key) {
      console.error(`Key not found: ${keyId}`);
      return null;
    }

    // Check if key is expired
    const now = Math.floor(Date.now() / 1000);
    if (key.expiry_time < now) {
      console.error(`Key expired: ${keyId}`);
      this.keyPool.delete(keyId);
      this.keyStore.delete(keyId);
      await this.deleteKeyFromStorage(keyId);
      return null;
    }

    return key;
  }

  async acknowledgeKeyUsage(keyId: string, ack: { consumed_bytes: number; message_id?: string }): Promise<boolean> {
    try {
      const key = this.keyPool.get(keyId);

      if (!key) {
        console.warn(`Attempted to acknowledge usage for unknown key: ${keyId}`);
        // Try to find it in storage if it was loaded but not yet in pool
        const storedKey = await this.getKey(keyId);
        if (!storedKey) {
          return false;
        }
        // If found, proceed with acknowledgment
        return this.acknowledgeKeyUsage(keyId, ack);
      }

      const newConsumedBytes = (key.consumed_bytes || 0) + ack.consumed_bytes;

      // Update consumed bytes in memory
      key.consumed_bytes = newConsumedBytes;

      // Persist updated key usage to storage
      await storage.updateQuantumKeyUsage(keyId, newConsumedBytes);

      // Keep key available for decryption even if consumed
      // Only mark as inactive if it exceeds maximum usage significantly
      if (newConsumedBytes >= (key.key_length_bits / 8) * 1.5) { // Compare bytes, not bits
        key.isActive = false;
        await storage.deactivateQuantumKey(keyId);
      }

      console.log(`Key ${keyId} usage acknowledged: ${newConsumedBytes}/${key.key_length_bits} bytes consumed`);
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
      const totalSizeBytes = activeKeys.reduce((sum, key) => sum + (key.keyMaterial ? key.keyMaterial.length * 3 / 4 : 0), 0); // Approximate size from base64
      const totalSizeMB = totalSizeBytes / (1024 * 1024);
      const remainingMB = Math.max(0, this.POOL_SIZE_MB - totalSizeMB);

      this.keyPoolStats = {
        availableKeys: totalKeys,
        totalMB: this.POOL_SIZE_MB,
        remainingMB: Math.round(remainingMB * 100) / 100,
        utilizationPercent: Math.round((totalSizeMB / this.POOL_SIZE_MB) * 100)
      };
      return this.keyPoolStats;
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
      // Clean up expired keys from memory and storage
      const now = new Date();
      for (const [keyId, key] of this.keyStore.entries()) {
        if (key.expiryTime < now) {
          this.keyPool.delete(keyId);
          this.keyStore.delete(keyId);
          await this.deleteKeyFromStorage(keyId);
        }
      }

      // Ensure pool size is maintained
      const currentSize = this.keyPool.size;
      if (currentSize < this.POOL_SIZE_TARGET) {
        const keysToAdd = this.POOL_SIZE_TARGET - currentSize;
        for (let i = 0; i < keysToAdd; i++) {
          await this.generateAndStoreQuantumKey();
        }
      }
      this.updateKeyPoolStats();
    } catch (error) {
      console.error("Key pool maintenance error:", error);
    }
  }

  private async generateAndStoreQuantumKey(): Promise<void> {
    const keyLengthBits = this.DEFAULT_KEY_LENGTH;
    const keyLengthBytes = Math.ceil(keyLengthBits / 8);
    const quantumKeyMaterial = this.generateQuantumKey(keyLengthBits);
    const keyId = `maintenance-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const storedKey: QuantumKeyEntry = {
      keyId,
      keyMaterial: quantumKeyMaterial,
      keyLength: keyLengthBytes,
      expiryTime: new Date(Date.now() + this.KEY_EXPIRY_MS),
      consumedBytes: 0,
      maxConsumptionBytes: keyLengthBytes,
      isActive: true,
      createdAt: new Date()
    };

    this.keyStore.set(keyId, storedKey);

    await storage.createQuantumKey({
      keyId,
      keyMaterial: quantumKeyMaterial,
      keyLength: keyLengthBytes,
      expiryTime: new Date(Date.now() + this.KEY_EXPIRY_MS),
      consumedBytes: 0,
      maxConsumptionBytes: keyLengthBytes,
      isActive: true
    });
  }

  async destroyKey(keyId: string): Promise<void> {
    this.keyPool.delete(keyId);
    this.keyStore.delete(keyId);
    await this.deleteKeyFromStorage(keyId);
    console.log(`Key ${keyId} destroyed successfully`);
  }

  private async deleteKeyFromStorage(keyId: string): Promise<void> {
    try {
      const storage = (await import('../storage')).storage;
      await storage.deleteQuantumKey(keyId);
      console.log(`Deleted key ${keyId} from storage`);
    } catch (error) {
      console.error(`Failed to delete key ${keyId} from storage:`, error);
    }
  }

  async updateQuantumKeyUsage(keyId: string, consumedBytes: number): Promise<void> {
    try {
      await storage.updateQuantumKey(keyId, { consumedBytes });
    } catch (error) {
      console.error(`Failed to update key usage: ${keyId}`, error);
    }
  }

  async deactivateQuantumKey(keyId: string): Promise<void> {
    try {
      await storage.updateQuantumKey(keyId, { isActive: false });
    } catch (error) {
      console.error(`Failed to deactivate key: ${keyId}`, error);
    }
  }

  private updateKeyPoolStats() {
    const activeKeys = Array.from(this.keyStore.values()).filter(key => key.isActive);
    const totalKeys = activeKeys.length;
    const totalSizeBytes = activeKeys.reduce((sum, key) => sum + (key.keyMaterial ? key.keyMaterial.length * 3 / 4 : 0), 0); // Approximate size from base64
    const totalSizeMB = totalSizeBytes / (1024 * 1024);
    const remainingMB = Math.max(0, this.POOL_SIZE_MB - totalSizeMB);

    this.keyPoolStats = {
      availableKeys: totalKeys,
      totalMB: this.POOL_SIZE_MB,
      remainingMB: Math.round(remainingMB * 100) / 100,
      utilizationPercent: Math.round((totalSizeMB / this.POOL_SIZE_MB) * 100)
    };
  }
}

export const kmeSimulator = new KMESimulator();