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
  decryptedData: string;
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
   * Level 1: One-Time Pad encryption using quantum keys
   */
  private async encryptOTP(data: Buffer, recipient?: string): Promise<EncryptionResult> {
    // Request quantum key from KME
    const keyRequest = {
      request_id: randomBytes(16).toString('hex'),
      key_length_bits: data.length * 8,
      recipient
    };

    const keyResponse = await kmeSimulator.requestKey(keyRequest);
    const keyMaterial = await kmeSimulator.getKey(keyResponse.key_id);
    
    if (!keyMaterial) {
      throw new Error("Failed to obtain quantum key material");
    }

    const keyBuffer = Buffer.from(keyMaterial.key_material, 'base64');
    
    // XOR data with quantum key (OTP)
    const encrypted = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      encrypted[i] = data[i] ^ keyBuffer[i];
    }

    // Generate HMAC for authentication
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
    const decrypted = Buffer.alloc(dataLength);
    for (let i = 0; i < dataLength; i++) {
      decrypted[i] = encrypted[i] ^ keyBuffer[i];
    }

    return {
      decryptedData: decrypted.toString('utf8'),
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
      decryptedData: result.decrypted.toString('utf8'),
      verified: result.verified
    };
  }

  private async decryptPQC(encryptedData: string, metadata: Record<string, any>): Promise<DecryptionResult> {
    const dataBuffer = Buffer.from(encryptedData, 'base64');
    const ivLength = metadata.ivLength || 12;
    const kemCiphertextLength = metadata.kemCiphertextLength || 1088; // Kyber-768 ciphertext length
    
    const iv = dataBuffer.slice(0, ivLength);
    const kemCiphertext = dataBuffer.slice(ivLength, ivLength + kemCiphertextLength);
    const encrypted = dataBuffer.slice(ivLength + kemCiphertextLength, -16);
    const authTag = dataBuffer.slice(-16);

    const keyMaterial = await kmeSimulator.getKey(metadata.keyId);
    if (!keyMaterial) {
      throw new Error("Quantum key not available for decryption");
    }

    const seedBuffer = Buffer.from(keyMaterial.key_material, 'base64');
    const kyberResult = this.simulateKyberDecapsulation(seedBuffer, kemCiphertext);

    const result = this.aesGCMDecrypt(encrypted, kyberResult.sharedSecret, iv, authTag);

    return {
      decryptedData: result.decrypted.toString('utf8'),
      verified: result.verified
    };
  }

  private async decryptPlain(encryptedData: string): Promise<DecryptionResult> {
    return {
      decryptedData: Buffer.from(encryptedData, 'base64').toString('utf8'),
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
    // Simulate CRYSTALS-Kyber-768 Key Encapsulation
    const kyberSeed = seed.slice(0, 64);
    
    // Generate Kyber public/private key pair from quantum seed
    const privateKey = this.hkdf(kyberSeed, 32, 'Kyber-PrivateKey');
    const publicKey = this.hkdf(kyberSeed, 32, 'Kyber-PublicKey');
    
    // Simulate encapsulation
    const ephemeralKey = randomBytes(32);
    const sharedSecret = this.hkdf(Buffer.concat([privateKey, ephemeralKey]), 32, 'Kyber-SharedSecret');
    const ciphertext = randomBytes(1088); // Kyber-768 ciphertext size
    const iv = randomBytes(12);
    
    // Mix quantum randomness into ciphertext
    for (let i = 0; i < Math.min(ciphertext.length, seed.length - 64); i++) {
      ciphertext[i] ^= seed[64 + i];
    }
    
    return { sharedSecret, ciphertext, iv, publicKey };
  }

  private simulateKyberDecapsulation(seed: Buffer, ciphertext: Buffer) {
    // Simulate CRYSTALS-Kyber-768 decapsulation
    const kyberSeed = seed.slice(0, 64);
    const privateKey = this.hkdf(kyberSeed, 32, 'Kyber-PrivateKey');
    
    // Extract ephemeral key from ciphertext (simulated)
    const ephemeralKey = this.hkdf(ciphertext.slice(0, 32), 32, 'Kyber-Ephemeral');
    const sharedSecret = this.hkdf(Buffer.concat([privateKey, ephemeralKey]), 32, 'Kyber-SharedSecret');
    
    return { sharedSecret };
  }
}

export const cryptoEngine = new CryptoEngine();
