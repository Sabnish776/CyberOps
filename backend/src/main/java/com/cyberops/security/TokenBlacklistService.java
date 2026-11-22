package com.cyberops.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service that maintains an active in-memory blacklist of logged-out or revoked JWTs.
 * Uses SHA-256 token hashing to conserve memory and avoid storing raw tokens in memory.
 */
@Service
@Slf4j
public class TokenBlacklistService {

    // Maps SHA-256 token hash -> expiry timestamp in ms
    private final Map<String, Long> blacklistedTokens = new ConcurrentHashMap<>();

    /**
     * Adds a token to the blacklist until its natural expiration time.
     *
     * @param token the raw JWT token
     * @param expirationTimestampMs expiration timestamp in milliseconds
     */
    public void blacklistToken(String token, long expirationTimestampMs) {
        if (token == null || token.isBlank()) return;
        String hash = hashToken(token);
        blacklistedTokens.put(hash, expirationTimestampMs);
        log.debug("Token blacklisted with expiry: {}", expirationTimestampMs);
        evictExpired();
    }

    /**
     * Checks if a token is present in the blacklist.
     *
     * @param token the raw JWT token
     * @return true if blacklisted and not yet expired, false otherwise
     */
    public boolean isBlacklisted(String token) {
        if (token == null || token.isBlank()) return false;
        String hash = hashToken(token);
        Long expiry = blacklistedTokens.get(hash);
        if (expiry == null) {
            return false;
        }

        // If the token has already passed its natural expiration, purge and return false
        if (expiry < System.currentTimeMillis()) {
            blacklistedTokens.remove(hash);
            return false;
        }

        return true;
    }

    /**
     * Purges expired entries from the blacklist map.
     */
    private void evictExpired() {
        if (blacklistedTokens.size() > 500) {
            long now = System.currentTimeMillis();
            blacklistedTokens.entrySet().removeIf(entry -> entry.getValue() < now);
        }
    }

    /**
     * Clears all entries (useful for testing).
     */
    public void reset() {
        blacklistedTokens.clear();
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (Exception e) {
            return String.valueOf(token.hashCode());
        }
    }
}
