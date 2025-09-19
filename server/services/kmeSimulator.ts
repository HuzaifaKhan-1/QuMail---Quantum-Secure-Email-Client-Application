import { randomUUID, randomBytes } from "crypto";
import { storage } from "../storage";

export interface KMEKeyRequest {
  request_id: string;
  key_length_bits: number;
  recipient?: string;
}

export interface KMEKeyResponse {
  key_id: string;
  delivery_uri: string;
}

export interface KMEKeyMaterial {
  key_id: string;
  key_material: string; // base64 encoded
  expiry: string; // ISO timestamp
  max_consumption_bytes: number;
}

export interface KMEKeyAck {
  consumed_bytes: number;
  message_id?: string;
}

export class KMESimulator {
  private baseUrl: string;

  constructor(baseUrl = "http://localhost:5000") {
    this.baseUrl = baseUrl;
  }

  /**
   * POST /kme/requestKey
   * Request a new quantum key from the KME
   */
  async requestKey(request: KMEKeyRequest): Promise<KMEKeyResponse> {
    // Generate a unique key ID
    const keyId = `QK-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${randomUUID().substring(0, 8).toUpperCase()}`;
    
    // Calculate key length in bytes
    const keyLengthBytes = Math.ceil(request.key_length_bits / 8);
    
    // Generate secure random key material
    const keyMaterial = randomBytes(keyLengthBytes).toString('base64');
    
    // Set expiry to 7 days from now
    const expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    // Store the key in our quantum key storage
    await storage.createQuantumKey({
      keyId,
      keyMaterial,
      keyLength: keyLengthBytes,
      maxConsumptionBytes: keyLengthBytes,
      expiryTime,
      isActive: true,
      consumedBytes: 0
    });

    // Store the key request
    await storage.createKeyRequest({
      requestId: request.request_id,
      keyLength: request.key_length_bits,
      recipient: request.recipient,
      status: "delivered",
      deliveryUri: `${this.baseUrl}/kme/keys/${keyId}`
    });

    return {
      key_id: keyId,
      delivery_uri: `${this.baseUrl}/kme/keys/${keyId}`
    };
  }

  /**
   * GET /kme/keys/:key_id
   * Retrieve key material for a specific key ID
   */
  async getKey(keyId: string): Promise<KMEKeyMaterial | null> {
    const key = await storage.getQuantumKey(keyId);
    
    if (!key || !key.isActive || key.expiryTime < new Date()) {
      return null;
    }

    return {
      key_id: key.keyId,
      key_material: key.keyMaterial || "",
      expiry: key.expiryTime.toISOString(),
      max_consumption_bytes: key.maxConsumptionBytes
    };
  }

  /**
   * POST /kme/keys/:key_id/ack
   * Acknowledge key consumption
   */
  async acknowledgeKeyUsage(keyId: string, ack: KMEKeyAck): Promise<boolean> {
    const success = await storage.consumeKey(keyId, ack.consumed_bytes);
    
    if (success) {
      // Log the key consumption
      await storage.createAuditLog({
        action: "key_consumed",
        details: {
          keyId,
          consumedBytes: ack.consumed_bytes,
          messageId: ack.message_id
        }
      });
    }

    return success;
  }

  /**
   * Get available key pool statistics
   */
  async getKeyPoolStats() {
    const activeKeys = await storage.getActiveKeys();
    
    const totalCapacity = activeKeys.reduce((sum, key) => sum + key.maxConsumptionBytes, 0);
    const totalConsumed = activeKeys.reduce((sum, key) => sum + (key.consumedBytes || 0), 0);
    const remainingCapacity = totalCapacity - totalConsumed;
    
    return {
      totalKeys: activeKeys.length,
      totalCapacityMB: Math.round(totalCapacity / (1024 * 1024) * 100) / 100,
      consumedMB: Math.round(totalConsumed / (1024 * 1024) * 100) / 100,
      remainingMB: Math.round(remainingCapacity / (1024 * 1024) * 100) / 100,
      utilizationPercent: totalCapacity > 0 ? Math.round((totalConsumed / totalCapacity) * 100) : 0
    };
  }

  /**
   * Auto-generate keys when pool is low
   */
  async maintainKeyPool(minKeys = 5, defaultKeySize = 8192) {
    const activeKeys = await storage.getActiveKeys();
    
    if (activeKeys.length < minKeys) {
      const keysToGenerate = minKeys - activeKeys.length;
      
      for (let i = 0; i < keysToGenerate; i++) {
        const request: KMEKeyRequest = {
          request_id: randomUUID(),
          key_length_bits: defaultKeySize * 8,
          recipient: "auto-generated"
        };
        
        await this.requestKey(request);
      }
      
      await storage.createAuditLog({
        action: "key_pool_maintenance",
        details: {
          keysGenerated: keysToGenerate,
          newPoolSize: activeKeys.length + keysToGenerate
        }
      });
    }
  }
}

export const kmeSimulator = new KMESimulator();
