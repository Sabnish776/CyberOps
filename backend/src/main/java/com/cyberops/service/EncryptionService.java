package com.cyberops.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * Implements SEC-001: Credential Encryption at rest using AES-256-GCM.
 * Protects SSH passwords, private keys, and passphrases.
 */
@Service
@Slf4j
public class EncryptionService {

    public static final String DEFAULT_MASTER_KEY = "CyberOpsMasterEncKey202632B!";

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    @Value("${app.security.master-key:CyberOpsMasterEncKey202632B!}")
    private String masterKeyString;

    @Autowired(required = false)
    private Environment environment;

    private SecretKey secretKey;
    private final SecureRandom secureRandom = new SecureRandom();

    @PostConstruct
    public void init() {
        validateKeyConfiguration();
        try {
            // Derive a 256-bit (32 bytes) key from the configured master key string using SHA-256
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] keyBytes = digest.digest(masterKeyString.getBytes(StandardCharsets.UTF_8));
            this.secretKey = new SecretKeySpec(keyBytes, "AES");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to initialize encryption key", e);
        }
    }

    public void validateKeyConfiguration() {
        boolean isDefault = DEFAULT_MASTER_KEY.equals(masterKeyString);
        boolean isProduction = isProductionEnvironment();

        if (isDefault) {
            if (isProduction) {
                throw new IllegalStateException(
                        "CRITICAL SECURITY FATAL: Running in production with default fallback APP_MASTER_KEY is prohibited. " +
                        "Please provide a secure, unique 32-byte APP_MASTER_KEY environment variable."
                );
            } else {
                log.warn("\n" +
                        "********************************************************************************\n" +
                        "* [SECURITY NOTICE] Active APP_MASTER_KEY is using the default public fallback. *\n" +
                        "* Set the 'APP_MASTER_KEY' environment variable before deploying to production! *\n" +
                        "********************************************************************************"
                );
            }
        }
    }

    private boolean isProductionEnvironment() {
        if (environment == null) return false;
        String[] profiles = environment.getActiveProfiles();
        return Arrays.stream(profiles)
                .anyMatch(p -> p.equalsIgnoreCase("prod") || p.equalsIgnoreCase("production"));
    }

    public boolean isUsingDefaultKey() {
        return DEFAULT_MASTER_KEY.equals(masterKeyString);
    }

    /**
     * Encrypts plaintext string using AES-256-GCM.
     * Returns Base64-encoded [12-byte IV + ciphertext + authentication tag]
     */
    public String encrypt(String plaintext) {
        if (plaintext == null || plaintext.isEmpty()) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec parameterSpec = new GCMParameterSpec(TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, parameterSpec);

            byte[] cipherText = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            ByteBuffer byteBuffer = ByteBuffer.allocate(iv.length + cipherText.length);
            byteBuffer.put(iv);
            byteBuffer.put(cipherText);

            return Base64.getEncoder().encodeToString(byteBuffer.array());
        } catch (Exception e) {
            throw new RuntimeException("Error during credential encryption", e);
        }
    }

    /**
     * Decrypts Base64-encoded [IV + ciphertext + authentication tag] to plaintext string.
     */
    public String decrypt(String encryptedBase64) {
        if (encryptedBase64 == null || encryptedBase64.isEmpty()) {
            return null;
        }
        try {
            byte[] decoded = Base64.getDecoder().decode(encryptedBase64);
            if (decoded.length < IV_LENGTH_BYTES) {
                throw new IllegalArgumentException("Invalid encrypted data length");
            }

            ByteBuffer byteBuffer = ByteBuffer.wrap(decoded);
            byte[] iv = new byte[IV_LENGTH_BYTES];
            byteBuffer.get(iv);

            byte[] cipherText = new byte[byteBuffer.remaining()];
            byteBuffer.get(cipherText);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec parameterSpec = new GCMParameterSpec(TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, parameterSpec);

            byte[] decrypted = cipher.doFinal(cipherText);
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Error during credential decryption", e);
        }
    }
}
