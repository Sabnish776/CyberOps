package com.cyberops.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Filter that protects sensitive auth endpoints from brute-force password guessing
 * and resource exhaustion by applying sliding-window rate limits per client IP.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RateLimitingFilter extends OncePerRequestFilter {

    private final RateLimiterService rateLimiterService;

    // Login: maximum 5 requests per 60 seconds per IP
    private static final int LOGIN_MAX_REQUESTS = 5;
    private static final long LOGIN_WINDOW_MS = 60_000L;

    // Register: maximum 5 requests per 60 seconds per IP
    private static final int REGISTER_MAX_REQUESTS = 5;
    private static final long REGISTER_WINDOW_MS = 60_000L;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();
        String method = request.getMethod();

        if ("POST".equalsIgnoreCase(method)) {
            String clientIp = getClientIp(request);

            if (path.endsWith("/api/auth/login")) {
                String key = "login:" + clientIp;
                if (!rateLimiterService.isAllowed(key, LOGIN_MAX_REQUESTS, LOGIN_WINDOW_MS)) {
                    log.warn("Rate limit exceeded for login attempts from IP: {}", clientIp);
                    rejectTooManyRequests(response, "Too many login attempts. Please wait 1 minute before trying again.");
                    return;
                }
            } else if (path.endsWith("/api/auth/register")) {
                String key = "register:" + clientIp;
                if (!rateLimiterService.isAllowed(key, REGISTER_MAX_REQUESTS, REGISTER_WINDOW_MS)) {
                    log.warn("Rate limit exceeded for registration attempts from IP: {}", clientIp);
                    rejectTooManyRequests(response, "Too many registration attempts. Please wait 1 minute before trying again.");
                    return;
                }
            }
        }

        filterChain.doFilter(request, response);
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwarded = request.getHeader("X-Forwarded-For");
        if (xForwarded != null && !xForwarded.isBlank()) {
            return xForwarded.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }

    private void rejectTooManyRequests(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value()); // HTTP 429
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Retry-After", "60");
        response.getWriter().write("{\"error\":\"" + message + "\",\"status\":429}");
    }
}
