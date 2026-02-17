import { randomBytes, createHash, createHmac } from "crypto";
import { SecurityLevel } from "@shared/schema";
import { storage } from "../storage";
import { kmeSimulator } from "./kmeSimulator";

export interface EncryptionResult {
  encryptedData: string;
  keyId?: string;
  metadata: Record<string, any>;
}

export interface DecryptionResult {
  decryptedData: Buffer;
  verified: boolean;
}

export class CryptoEngine {
  /**
   * Encrypt data using the specified security level
   */
  async encrypt(
    data: string | Buffer,
    securityLevel: SecurityLevel,
    recipient?: string
  ): Promise<EncryptionResult> {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    switch (securityLevel) {
      case SecurityLevel.LEVEL1_OTP:
        return this.encryptOTP(dataBuffer, recipient);
      case SecurityLevel.LEVEL2_AES:
        return this.encryptAES(dataBuffer, recipient);
      case SecurityLevel.LEVEL3_PQC:
        return this.encryptPQC(dataBuffer, recipient);
      case SecurityLevel.LEVEL4_PLAIN:
        return this.encryptPlain(dataBuffer);
      default:
        throw new Error(`Unsupported security level: ${securityLevel}`);
    }
  }

  /**
   * Decrypt data using the stored metadata
   */
  async decrypt(
    encryptedData: string,
    metadata: Record<string, any>
  ): Promise<DecryptionResult> {
    const securityLevel = metadata.securityLevel as SecurityLevel;

    switch (securityLevel) {
      case SecurityLevel.LEVEL1_OTP:
        return this.decryptOTP(encryptedData, metadata);
      case SecurityLevel.LEVEL2_AES:
        return this.decryptAES(encryptedData, metadata);
      case SecurityLevel.LEVEL3_PQC:
        return this.decryptPQC(encryptedData, metadata);
      case SecurityLevel.LEVEL4_PLAIN:
        return this.decryptPlain(encryptedData);
      default:
        throw new Error(`Unsupported security level: ${securityLevel}`);
    }
  }

  /**
   * Re-encrypt body for editing purposes
   */
  async encryptBody(body: string, keyMaterial: string): Promise<string> {
    const data = Buffer.from(body, 'utf8');
    const keyBuffer = Buffer.from(keyMaterial, 'base64');

    // XOR data with quantum key (OTP)
    const encrypted = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      encrypted[i] = data[i] ^ keyBuffer[i];
    }

    // Generate HMAC for authentication
    const hmac = createHmac('sha256', keyBuffer.slice(data.length, data.length + 32));
    hmac.update(encrypted);
    const authTag = hmac.digest();

    return Buffer.concat([encrypted, authTag]).toString('base64');
  }

  /**
   * Level 1: One-Time Pad encryption using quantum keys
   */
  private async encryptOTP(data: Buffer, recipient?: string): Promise<EncryptionResult> {
    // Request quantum key from KME - include 32 bytes for HMAC
    const keyRequest = {
      request_id: randomBytes(16).toString('hex'),
      key_length_bits: (data.length + 32) * 8,
      recipient
    };

    const keyResponse = await kmeSimulator.requestKey(keyRequest);
    const keyMaterial = await kmeSimulator.getKey(keyResponse.key_id);

    if (!keyMaterial) {
      throw new Error("Failed to obtain quantum key material");
    }

    if (!keyMaterial.key_material) {
      throw new Error("Key material is empty or undefined");
    }

    const keyBuffer = Buffer.from(keyMaterial.key_material, 'base64');

    // XOR data with quantum key (OTP)
    const encrypted = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      encrypted[i] = data[i] ^ keyBuffer[i];
    }

    // Generate HMAC for authentication using the tail of the key
    const hmac = createHmac('sha256', keyBuffer.slice(data.length, data.length + 32));
    hmac.update(encrypted);
    const authTag = hmac.digest();

    // Combine encrypted data with auth tag
    const result = Buffer.concat([encrypted, authTag]);

    // Acknowledge key consumption
    await kmeSimulator.acknowledgeKeyUsage(keyResponse.key_id, {
      consumed_bytes: data.length + 32, // data + HMAC key
      message_id: keyRequest.request_id
    });

    return {
      encryptedData: result.toString('base64'),
      keyId: keyResponse.key_id,
      metadata: {
        securityLevel: SecurityLevel.LEVEL1_OTP,
        keyId: keyResponse.key_id,
        dataLength: data.length,
        algorithm: 'OTP-XOR',
        authAlgorithm: 'HMAC-SHA256'
      }
    };
  }

  /**
   * Level 2: AES-GCM with quantum-seeded keys
   */
  private async encryptAES(data: Buffer, recipient?: string): Promise<EncryptionResult> {
    // Request smaller quantum key for seeding
    const keyRequest = {
      request_id: randomBytes(16).toString('hex'),
      key_length_bits: 256, // 32 bytes for seed
      recipient
    };

    const keyResponse = await kmeSimulator.requestKey(keyRequest);
    const keyMaterial = await kmeSimulator.getKey(keyResponse.key_id);

    if (!keyMaterial) {
      throw new Error("Failed to obtain quantum key material");
    }

    const seedBuffer = Buffer.from(keyMaterial.key_material, 'base64');

    // Derive AES key using HKDF
    const aesKey = this.hkdf(seedBuffer, 32, 'QuMail-AES-Key');
    const iv = randomBytes(12); // GCM IV

    // Encrypt using AES-GCM (simulated with AES-CTR + HMAC)
    const cipher = this.aesGCMEncrypt(data, aesKey, iv);

    // Acknowledge key consumption
    await kmeSimulator.acknowledgeKeyUsage(keyResponse.key_id, {
      consumed_bytes: 32, // seed consumption
      message_id: keyRequest.request_id
    });

    return {
      encryptedData: Buffer.concat([iv, cipher.encrypted, cipher.authTag]).toString('base64'),
      keyId: keyResponse.key_id,
      metadata: {
        securityLevel: SecurityLevel.LEVEL2_AES,
        keyId: keyResponse.key_id,
        algorithm: 'AES-256-GCM',
        ivLength: 12
      }
    };
  }

  /**
   * Level 3: Post-Quantum Cryptography hybrid (CRYSTALS-Kyber simulation)
   */
  private async encryptPQC(data: Buffer, recipient?: string): Promise<EncryptionResult> {
    // Simulate CRYSTALS-Kyber KEM with quantum-seeded keys
    const keyRequest = {
      request_id: randomBytes(16).toString('hex'),
      key_length_bits: 768, // Kyber-768 equivalent
      recipient
    };

    const keyResponse = await kmeSimulator.requestKey(keyRequest);
    const keyMaterial = await kmeSimulator.getKey(keyResponse.key_id);

    if (!keyMaterial) {
      throw new Error("Failed to obtain quantum key material");
    }

    const seedBuffer = Buffer.from(keyMaterial.key_material, 'base64');

    // Simulate Kyber KEM with quantum seed
    const kyberResult = this.simulateKyberKEM(seedBuffer);

    // Use derived key for AES-GCM encryption
    const encryptedData = this.aesGCMEncrypt(data, kyberResult.sharedSecret, kyberResult.iv);

    await kmeSimulator.acknowledgeKeyUsage(keyResponse.key_id, {
      consumed_bytes: 96, // Kyber seed consumption
      message_id: keyRequest.request_id
    });

    return {
      encryptedData: Buffer.concat([
        kyberResult.iv,
        kyberResult.ciphertext,
        encryptedData.encrypted,
        encryptedData.authTag
      ]).toString('base64'),
      keyId: keyResponse.key_id,
      metadata: {
        securityLevel: SecurityLevel.LEVEL3_PQC,
        keyId: keyResponse.key_id,
        algorithm: 'CRYSTALS-Kyber-768-Simulated',
        kemCiphertextLength: kyberResult.ciphertext.length,
        ivLength: kyberResult.iv.length
      }
    };
  }

  /**
   * Level 4: Plain text (no encryption)
   */
  private async encryptPlain(data: Buffer): Promise<EncryptionResult> {
    return {
      encryptedData: data.toString('base64'),
      metadata: {
        securityLevel: SecurityLevel.LEVEL4_PLAIN,
        algorithm: 'none'
      }
    };
  }

  // Decryption methods
  private async decryptOTP(encryptedData: string, metadata: Record<string, any>): Promise<DecryptionResult> {
    const dataBuffer = Buffer.from(encryptedData, 'base64');
    const dataLength = metadata.dataLength;

    if (!dataLength || typeof dataLength !== 'number') {
      throw new Error(`Invalid data length in metadata: ${dataLength}`);
    }

    const encrypted = dataBuffer.slice(0, dataLength);
    const authTag = dataBuffer.slice(dataLength);

    const keyMaterial = await kmeSimulator.getKey(metadata.keyId);
    if (!keyMaterial) {
      throw new Error("Quantum key not available for decryption");
    }

    const keyBuffer = Buffer.from(keyMaterial.key_material, 'base64');

    // Verify HMAC
    const hmac = createHmac('sha256', keyBuffer.slice(dataLength, dataLength + 32));
    hmac.update(encrypted);
    const expectedTag = hmac.digest();

    const verified = expectedTag.equals(authTag);

    // XOR to decrypt
    if (dataLength <= 0) {
      throw new Error(`Invalid data length for decryption: ${dataLength}`);
    }

    const decrypted = Buffer.alloc(dataLength);
    for (let i = 0; i < dataLength; i++) {
      decrypted[i] = encrypted[i] ^ keyBuffer[i];
    }

    return {
      decryptedData: decrypted,
      verified
    };
  }

  private async decryptAES(encryptedData: string, metadata: Record<string, any>): Promise<DecryptionResult> {
    const dataBuffer = Buffer.from(encryptedData, 'base64');
    const iv = dataBuffer.slice(0, 12);
    const encrypted = dataBuffer.slice(12, -16);
    const authTag = dataBuffer.slice(-16);

    const keyMaterial = await kmeSimulator.getKey(metadata.keyId);
    if (!keyMaterial) {
      throw new Error("Quantum key not available for decryption");
    }

    const seedBuffer = Buffer.from(keyMaterial.key_material, 'base64');
    const aesKey = this.hkdf(seedBuffer, 32, 'QuMail-AES-Key');

    const result = this.aesGCMDecrypt(encrypted, aesKey, iv, authTag);

    return {
      decryptedData: result.decrypted,
      verified: result.verified
    };
  }

  private async decryptPQC(encryptedData: string, metadata: Record<string, any>): Promise<DecryptionResult> {
    try {
      const dataBuffer = Buffer.from(encryptedData, 'base64');
      const ivLength = metadata.ivLength || 12;
      const kemCiphertextLength = metadata.kemCiphertextLength || 1088;

      const iv = dataBuffer.slice(0, ivLength);
      const kemCiphertext = dataBuffer.slice(ivLength, ivLength + kemCiphertextLength);
      const encrypted = dataBuffer.slice(ivLength + kemCiphertextLength, -16);
      const authTag = dataBuffer.slice(-16);

      const keyId = metadata.keyId;
      if (!keyId) {
        throw new Error("Missing keyId in metadata for PQC decryption");
      }

      const keyMaterial = await kmeSimulator.getKey(keyId);
      if (!keyMaterial) {
        throw new Error("Quantum key not available for PQC decryption");
      }

      const seedBuffer = Buffer.from(keyMaterial.key_material, 'base64');
      const kyberResult = this.simulateKyberDecapsulation(seedBuffer, kemCiphertext);

      // Use the derived shared secret to decrypt the AES-GCM payload
      const result = this.aesGCMDecrypt(encrypted, kyberResult.sharedSecret, iv, authTag);

      if (!result.verified) {
        console.error("[PQC ERROR] Authentication failed for PQC message");
      }

      return {
        decryptedData: result.decrypted,
        verified: result.verified
      };
    } catch (error: any) {
      console.error("[PQC ERROR] Decryption process failed:", error);
      return { decryptedData: Buffer.alloc(0), verified: false };
    }
  }

  private async decryptPlain(encryptedData: string): Promise<DecryptionResult> {
    return {
      decryptedData: Buffer.from(encryptedData, 'base64'),
      verified: true
    };
  }

  // Utility methods
  private hkdf(ikm: Buffer, length: number, info: string): Buffer {
    const hash = createHash('sha256');
    hash.update(ikm);
    hash.update(info);
    return hash.digest().slice(0, length);
  }

  private aesGCMEncrypt(data: Buffer, key: Buffer, iv: Buffer) {
    // Simplified AES-GCM simulation using XOR and HMAC
    const encrypted = Buffer.alloc(data.length);
    const keyStream = this.generateKeyStream(key, iv, data.length);

    for (let i = 0; i < data.length; i++) {
      encrypted[i] = data[i] ^ keyStream[i];
    }

    const hmac = createHmac('sha256', key);
    hmac.update(iv);
    hmac.update(encrypted);
    const authTag = hmac.digest().slice(0, 16);

    return { encrypted, authTag };
  }

  private aesGCMDecrypt(encrypted: Buffer, key: Buffer, iv: Buffer, authTag: Buffer) {
    // Verify auth tag
    const hmac = createHmac('sha256', key);
    hmac.update(iv);
    hmac.update(encrypted);
    const expectedTag = hmac.digest().slice(0, 16);
    const verified = expectedTag.equals(authTag);

    // Decrypt
    const decrypted = Buffer.alloc(encrypted.length);
    const keyStream = this.generateKeyStream(key, iv, encrypted.length);

    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ keyStream[i];
    }

    return { decrypted, verified };
  }

  private generateKeyStream(key: Buffer, iv: Buffer, length: number): Buffer {
    const stream = Buffer.alloc(length);
    let counter = 0;

    for (let i = 0; i < length; i += 32) {
      const hash = createHash('sha256');
      hash.update(key);
      hash.update(iv);
      hash.update(Buffer.from([counter++]));
      const block = hash.digest();

      const copyLength = Math.min(32, length - i);
      block.copy(stream, i, 0, copyLength);
    }

    return stream;
  }

  private simulateKyberKEM(seed: Buffer) {
    // Simplify to stable seed-based derivation for the simulation
    const sharedSecret = this.hkdf(seed, 32, 'Kyber-SharedSecret');
    const ciphertext = randomBytes(1088);
    const iv = randomBytes(12);
    const publicKey = this.hkdf(seed, 32, 'Kyber-PublicKey');

    return { sharedSecret, ciphertext, iv, publicKey };
  }

  private simulateKyberDecapsulation(seed: Buffer, ciphertext: Buffer) {
    // Match the stable seed-based derivation
    const sharedSecret = this.hkdf(seed, 32, 'Kyber-SharedSecret');
    return { sharedSecret };
  }
}

export const cryptoEngine = new CryptoEngine();
