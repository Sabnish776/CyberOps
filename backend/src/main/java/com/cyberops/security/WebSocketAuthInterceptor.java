package com.cyberops.security;

import com.cyberops.service.SshSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * HandshakeInterceptor to secure WebSocket connections.
 * Validates JWT from query param or Authorization header and enforces
 * session ownership verification before completing the WebSocket handshake.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketAuthInterceptor implements HandshakeInterceptor {

    private final JwtUtil jwtUtil;
    private final SshSessionManager sshSessionManager;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String token = extractToken(request.getURI(), request);
        if (!StringUtils.hasText(token) || !jwtUtil.validateToken(token)) {
            log.warn("WebSocket handshake rejected: missing or invalid JWT from {}", request.getRemoteAddress());
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        Long userId;
        try {
            userId = jwtUtil.getUserIdFromToken(token);
        } catch (Exception e) {
            log.warn("WebSocket handshake rejected: failed to extract userId from token: {}", e.getMessage());
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        String sessionId = extractSessionId(request.getURI());
        if (sessionId == null || !sshSessionManager.isAuthorized(sessionId, userId)) {
            log.warn("WebSocket handshake forbidden: user {} not authorized for session {} from {}",
                    userId, sessionId, request.getRemoteAddress());
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }

        attributes.put("userId", userId);
        attributes.put("sessionId", sessionId);
        log.info("WebSocket handshake authorized: user {} for session {}", userId, sessionId);
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            log.warn("WebSocket handshake completed with exception: {}", exception.getMessage());
        }
    }

    private String extractToken(URI uri, ServerHttpRequest request) {
        // 1. Try query parameter ?token=...
        if (uri != null && uri.getQuery() != null) {
            for (String param : uri.getQuery().split("&")) {
                String[] pair = param.split("=", 2);
                if (pair.length == 2 && "token".equalsIgnoreCase(pair[0])) {
                    return URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
                }
            }
        }

        // 2. Try Authorization header
        String authHeader = request.getHeaders().getFirst("Authorization");
        if (StringUtils.hasText(authHeader) && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }

        return null;
    }

    private String extractSessionId(URI uri) {
        if (uri == null || uri.getPath() == null) return null;
        String path = uri.getPath();
        String[] parts = path.split("/");
        return parts.length > 0 ? parts[parts.length - 1] : null;
    }
}
