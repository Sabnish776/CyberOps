package com.cyberops.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Date;
import java.util.function.Function;

@Component
@Slf4j
public class JwtUtil {

    public static final String DEFAULT_JWT_SECRET = "S3cur3Cyb3rOpsJwTS3cr3tK3y2026!@#$";

    @Value("${app.security.jwt.secret:S3cur3Cyb3rOpsJwTS3cr3tK3y2026!@#$}")
    private String jwtSecretString;

    @Value("${app.security.jwt.expiration-ms:86400000}")
    private long jwtExpirationMs;

    @Autowired(required = false)
    private Environment environment;

    private SecretKey signingKey;

    @PostConstruct
    public void init() {
        validateSecretConfiguration();
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] keyBytes = digest.digest(jwtSecretString.getBytes(StandardCharsets.UTF_8));
            this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to initialize JWT signing key", e);
        }
    }

    public void validateSecretConfiguration() {
        boolean isDefault = DEFAULT_JWT_SECRET.equals(jwtSecretString);
        boolean isProduction = isProductionEnvironment();

        if (isDefault) {
            if (isProduction) {
                throw new IllegalStateException(
                        "CRITICAL SECURITY FATAL: Running in production with default fallback JWT_SECRET is prohibited. " +
                        "Please provide a secure, unique JWT_SECRET environment variable."
                );
            } else {
                log.warn("\n" +
                        "********************************************************************************\n" +
                        "* [SECURITY NOTICE] Active JWT secret is using the default public fallback.      *\n" +
                        "* Set the 'JWT_SECRET' environment variable before deploying to production!     *\n" +
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

    public boolean isUsingDefaultSecret() {
        return DEFAULT_JWT_SECRET.equals(jwtSecretString);
    }

    public String generateToken(Long userId, String email) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtExpirationMs);

        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("email", email)
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(signingKey)
                .compact();
    }

    public Long getUserIdFromToken(String token) {
        Claims claims = extractAllClaims(token);
        return Long.parseLong(claims.getSubject());
    }

    public String getEmailFromToken(String token) {
        Claims claims = extractAllClaims(token);
        return claims.get("email", String.class);
    }

    public boolean validateToken(String token) {
        try {
            Claims claims = extractAllClaims(token);
            return !claims.getExpiration().before(new Date());
        } catch (Exception e) {
            return false;
        }
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
