package com.cyberops.service;

import com.cyberops.dto.AuthDtos.*;
import com.cyberops.model.User;
import com.cyberops.repository.UserRepository;
import com.cyberops.security.JwtUtil;
import com.cyberops.security.TokenBlacklistService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final TokenBlacklistService tokenBlacklistService;
    private final AuditService auditService;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email is already registered");
        }

        User user = User.builder()
                .name(request.getName().trim())
                .email(request.getEmail().trim().toLowerCase())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .build();

        user = userRepository.save(user);
        auditService.recordEvent(user.getId(), null, "USER_REGISTER", "SUCCESS", "New user registered: " + user.getEmail());

        String token = jwtUtil.generateToken(user.getId(), user.getEmail());
        return AuthResponse.builder()
                .token(token)
                .user(UserDto.builder()
                        .id(user.getId())
                        .name(user.getName())
                        .email(user.getEmail())
                        .build())
                .build();
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail().trim().toLowerCase())
                .orElseThrow(() -> {
                    auditService.recordEvent(null, null, "USER_LOGIN", "FAILED", "Attempted login for unknown email: " + request.getEmail());
                    return new IllegalArgumentException("Invalid email or password");
                });

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            auditService.recordEvent(user.getId(), null, "USER_LOGIN", "FAILED", "Invalid credentials for email: " + user.getEmail());
            throw new IllegalArgumentException("Invalid email or password");
        }

        auditService.recordEvent(user.getId(), null, "USER_LOGIN", "SUCCESS", "User authenticated: " + user.getEmail());
        String token = jwtUtil.generateToken(user.getId(), user.getEmail());

        return AuthResponse.builder()
                .token(token)
                .user(UserDto.builder()
                        .id(user.getId())
                        .name(user.getName())
                        .email(user.getEmail())
                        .build())
                .build();
    }

    public void logout(String token) {
        if (token != null && !token.isBlank()) {
            try {
                long expirationTime = jwtUtil.getExpirationTimeFromToken(token);
                Long userId = jwtUtil.getUserIdFromToken(token);
                tokenBlacklistService.blacklistToken(token, expirationTime);
                auditService.recordEvent(userId, null, "USER_LOGOUT", "SUCCESS", "User logged out; token invalidated");
                log.info("Token blacklisted successfully for user id: {}", userId);
            } catch (Exception e) {
                // If token cannot be fully parsed, blacklist it anyway for 24h
                tokenBlacklistService.blacklistToken(token, System.currentTimeMillis() + 86400000L);
                log.warn("Token blacklisted with fallback expiry: {}", e.getMessage());
            }
        }
    }
}
