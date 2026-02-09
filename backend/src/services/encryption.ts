import crypto from 'crypto';

/**
 * Encryption service for sensitive data
 * Uses AES-256-GCM for authenticated encryption
 */
export class EncryptionService {
  private static algorithm = 'aes-256-gcm';

  /**
   * Get encryption key from environment or generate warning
   */
  private static getKey(purpose: 'general' | 'mfa' | 'backup' = 'general'): Buffer {
    let envKey: string | undefined;

    switch (purpose) {
      case 'mfa':
        envKey = process.env.MFA_ENCRYPTION_KEY;
        break;
      case 'backup':
        envKey = process.env.BACKUP_ENCRYPTION_KEY;
        break;
      default:
        envKey = process.env.ENCRYPTION_KEY;
    }

    if (!envKey || envKey.includes('change_this')) {
      console.error(`WARNING: ${purpose.toUpperCase()} encryption key not properly configured!`);
      console.error('Generate a secure key with: openssl rand -hex 32');
      // Use a fallback for development only
      if (process.env.NODE_ENV === 'development') {
        return crypto.createHash('sha256')
          .update(`dev-key-${purpose}-insecure`)
          .digest();
      }
      throw new Error('Encryption key not configured');
    }

    // Ensure key is 32 bytes (256 bits)
    return crypto.createHash('sha256').update(envKey).digest();
  }

  /**
   * Encrypt sensitive data
   */
  static encrypt(text: string, purpose: 'general' | 'mfa' | 'backup' = 'general'): string {
    try {
      const key = this.getKey(purpose);
      const iv = crypto.randomBytes(16); // 128-bit IV
      const cipher = crypto.createCipheriv(this.algorithm, key, iv) as any;

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Combine IV, auth tag, and encrypted data
      const combined = Buffer.concat([
        iv,
        authTag,
        Buffer.from(encrypted, 'hex')
      ]);

      return combined.toString('base64');
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  static decrypt(encryptedData: string, purpose: 'general' | 'mfa' | 'backup' = 'general'): string {
    try {
      const key = this.getKey(purpose);
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const iv = combined.slice(0, 16);
      const authTag = combined.slice(16, 32);
      const encrypted = combined.slice(32);

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv) as any;
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hash sensitive data for comparison (one-way)
   */
  static hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Generate secure random token
   */
  static generateToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Encrypt object as JSON
   */
  static encryptObject(obj: any, purpose: 'general' | 'mfa' | 'backup' = 'general'): string {
    return this.encrypt(JSON.stringify(obj), purpose);
  }

  /**
   * Decrypt JSON object
   */
  static decryptObject<T = any>(encryptedData: string, purpose: 'general' | 'mfa' | 'backup' = 'general'): T {
    const decrypted = this.decrypt(encryptedData, purpose);
    return JSON.parse(decrypted);
  }

  /**
   * Encrypt email credentials
   */
  static encryptEmailCredentials(email: string, password: string): string {
    const credentials = { email, password, timestamp: Date.now() };
    return this.encryptObject(credentials, 'general');
  }

  /**
   * Decrypt email credentials
   */
  static decryptEmailCredentials(encryptedData: string): { email: string; password: string } {
    const decrypted = this.decryptObject<{ email: string; password: string; timestamp: number }>(
      encryptedData,
      'general'
    );
    return { email: decrypted.email, password: decrypted.password };
  }

  /**
   * Encrypt MFA secret
   */
  static encryptMFASecret(secret: string): string {
    return this.encrypt(secret, 'mfa');
  }

  /**
   * Decrypt MFA secret
   */
  static decryptMFASecret(encryptedSecret: string): string {
    return this.decrypt(encryptedSecret, 'mfa');
  }

  /**
   * Encrypt API key or token
   */
  static encryptAPIKey(apiKey: string): string {
    const keyData = {
      key: apiKey,
      createdAt: Date.now(),
      version: 1
    };
    return this.encryptObject(keyData, 'general');
  }

  /**
   * Decrypt API key or token
   */
  static decryptAPIKey(encryptedKey: string): string {
    const decrypted = this.decryptObject<{ key: string; createdAt: number; version: number }>(
      encryptedKey,
      'general'
    );
    return decrypted.key;
  }

  /**
   * Mask sensitive data for display
   */
  static mask(text: string, showChars: number = 4): string {
    if (!text || text.length <= showChars) {
      return '****';
    }
    const masked = '*'.repeat(text.length - showChars);
    return masked + text.slice(-showChars);
  }

  /**
   * Validate encryption key configuration
   */
  static validateConfiguration(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Check general encryption key
    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.includes('change_this')) {
      warnings.push('ENCRYPTION_KEY not properly configured');
    }

    // Check MFA encryption key
    if (!process.env.MFA_ENCRYPTION_KEY || process.env.MFA_ENCRYPTION_KEY.includes('change_this')) {
      warnings.push('MFA_ENCRYPTION_KEY not properly configured');
    }

    // Check backup encryption key
    if (!process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY.includes('change_this')) {
      warnings.push('BACKUP_ENCRYPTION_KEY not properly configured');
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }
}

export default EncryptionService;