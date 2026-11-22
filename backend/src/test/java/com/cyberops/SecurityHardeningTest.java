package com.cyberops;

import com.cyberops.dto.DatabaseQueryDtos.DatabaseQueryRequest;
import com.cyberops.dto.ServiceDtos.ServiceActionRequestDto;
import com.cyberops.model.ServerProfile;
import com.cyberops.repository.CredentialRepository;
import com.cyberops.repository.ServerProfileRepository;
import com.cyberops.security.JwtUtil;
import com.cyberops.security.WebSocketAuthInterceptor;
import com.cyberops.service.DatabaseService;
import com.cyberops.service.EncryptionService;
import com.cyberops.service.ServiceManagerService;
import com.cyberops.service.SshClientService;
import com.cyberops.service.SshSessionManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class SecurityHardeningTest {

    @Mock
    private JwtUtil jwtUtil;

    @Mock
    private SshSessionManager sshSessionManager;

    @Mock
    private ServerHttpRequest serverHttpRequest;

    @Mock
    private ServerHttpResponse serverHttpResponse;

    @Mock
    private WebSocketHandler webSocketHandler;

    @Mock
    private ServerProfileRepository serverRepository;

    @Mock
    private CredentialRepository credentialRepository;

    @Mock
    private EncryptionService encryptionService;

    @Mock
    private SshClientService sshClientService;

    private WebSocketAuthInterceptor webSocketAuthInterceptor;
    private DatabaseService databaseService;
    private ServiceManagerService serviceManagerService;

    @BeforeEach
    void setUp() {
        webSocketAuthInterceptor = new WebSocketAuthInterceptor(jwtUtil, sshSessionManager);
        databaseService = new DatabaseService(sshClientService, serverRepository, credentialRepository, encryptionService);
        serviceManagerService = new ServiceManagerService(sshClientService, serverRepository, credentialRepository, encryptionService);
    }

    @Test
    @DisplayName("WebSocketAuthInterceptor rejects request missing JWT token")
    void testWebSocketMissingToken() {
        when(serverHttpRequest.getURI()).thenReturn(URI.create("ws://localhost:8080/ws/terminal/sess-123"));
        when(serverHttpRequest.getHeaders()).thenReturn(new HttpHeaders());

        Map<String, Object> attributes = new HashMap<>();
        boolean allowed = webSocketAuthInterceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(allowed);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("WebSocketAuthInterceptor rejects request with invalid JWT token")
    void testWebSocketInvalidToken() {
        when(serverHttpRequest.getURI()).thenReturn(URI.create("ws://localhost:8080/ws/terminal/sess-123?token=badtoken"));
        when(jwtUtil.validateToken("badtoken")).thenReturn(false);

        Map<String, Object> attributes = new HashMap<>();
        boolean allowed = webSocketAuthInterceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(allowed);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("WebSocketAuthInterceptor forbids request when session is not owned by user")
    void testWebSocketForbiddenSession() {
        when(serverHttpRequest.getURI()).thenReturn(URI.create("ws://localhost:8080/ws/terminal/sess-123?token=validtoken"));
        when(jwtUtil.validateToken("validtoken")).thenReturn(true);
        when(jwtUtil.getUserIdFromToken("validtoken")).thenReturn(42L);
        when(sshSessionManager.isAuthorized("sess-123", 42L)).thenReturn(false);

        Map<String, Object> attributes = new HashMap<>();
        boolean allowed = webSocketAuthInterceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(allowed);
        verify(serverHttpResponse).setStatusCode(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("WebSocketAuthInterceptor authorizes connection when token and session ownership match")
    void testWebSocketAuthorized() {
        when(serverHttpRequest.getURI()).thenReturn(URI.create("ws://localhost:8080/ws/terminal/sess-123?token=validtoken"));
        when(jwtUtil.validateToken("validtoken")).thenReturn(true);
        when(jwtUtil.getUserIdFromToken("validtoken")).thenReturn(42L);
        when(sshSessionManager.isAuthorized("sess-123", 42L)).thenReturn(true);

        Map<String, Object> attributes = new HashMap<>();
        boolean allowed = webSocketAuthInterceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertTrue(allowed);
        assertEquals(42L, attributes.get("userId"));
        assertEquals("sess-123", attributes.get("sessionId"));
    }

    @Test
    @DisplayName("DatabaseService rejects queries with illegal characters in username or dbname")
    void testDatabaseServiceParameterValidation() {
        ServerProfile server = ServerProfile.builder().id(1L).userId(10L).name("srv").hostname("10.0.0.1").build();
        when(serverRepository.findByIdAndUserId(1L, 10L)).thenReturn(Optional.of(server));

        // Malicious username injection
        DatabaseQueryRequest badUserReq = new DatabaseQueryRequest();
        badUserReq.setServiceType("MYSQL");
        badUserReq.setQuery("SELECT 1;");
        badUserReq.setUsername("root; id;");

        IllegalArgumentException exUser = assertThrows(IllegalArgumentException.class, () ->
                databaseService.executeQuery(1L, 10L, badUserReq));
        assertTrue(exUser.getMessage().contains("Invalid username"));

        // Malicious database name injection
        DatabaseQueryRequest badDbReq = new DatabaseQueryRequest();
        badDbReq.setServiceType("MYSQL");
        badDbReq.setQuery("SELECT 1;");
        badDbReq.setDatabaseName("db; rm -rf /;");

        IllegalArgumentException exDb = assertThrows(IllegalArgumentException.class, () ->
                databaseService.executeQuery(1L, 10L, badDbReq));
        assertTrue(exDb.getMessage().contains("Invalid database name"));

        // Malicious newline in password
        DatabaseQueryRequest badPassReq = new DatabaseQueryRequest();
        badPassReq.setServiceType("MYSQL");
        badPassReq.setQuery("SELECT 1;");
        badPassReq.setPassword("secret\nwhoami");

        IllegalArgumentException exPass = assertThrows(IllegalArgumentException.class, () ->
                databaseService.executeQuery(1L, 10L, badPassReq));
        assertTrue(exPass.getMessage().contains("newline or null characters not permitted"));
    }

    @Test
    @DisplayName("ServiceManagerService rejects sudo passwords containing newline characters")
    void testServiceManagerPasswordInjection() {
        ServerProfile server = ServerProfile.builder().id(1L).userId(10L).name("srv").hostname("10.0.0.1").build();
        when(serverRepository.findByIdAndUserId(1L, 10L)).thenReturn(Optional.of(server));

        ServiceActionRequestDto badSudoReq = new ServiceActionRequestDto();
        badSudoReq.setAction("restart");
        badSudoReq.setServiceName("nginx");
        badSudoReq.setSudoPassword("secret\nrm -rf /");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                serviceManagerService.executeAction(1L, 10L, badSudoReq));
        assertTrue(ex.getMessage().contains("newline or null characters not permitted"));
    }

    @Test
    @DisplayName("RateLimiterService enforces sliding window limits and resets")
    void testRateLimiterService() {
        com.cyberops.security.RateLimiterService limiter = new com.cyberops.security.RateLimiterService();
        String key = "test:127.0.0.1";

        // 3 requests allowed in 1000ms window
        assertTrue(limiter.isAllowed(key, 3, 1000L));
        assertTrue(limiter.isAllowed(key, 3, 1000L));
        assertTrue(limiter.isAllowed(key, 3, 1000L));

        // 4th request rejected
        assertFalse(limiter.isAllowed(key, 3, 1000L));

        // Reset clears entries
        limiter.reset();
        assertTrue(limiter.isAllowed(key, 3, 1000L));
    }

    @Test
    @DisplayName("RateLimitingFilter returns 429 Too Many Requests after 5 login attempts")
    void testRateLimitingFilter() throws Exception {
        com.cyberops.security.RateLimiterService limiter = new com.cyberops.security.RateLimiterService();
        com.cyberops.security.RateLimitingFilter filter = new com.cyberops.security.RateLimitingFilter(limiter);

        jakarta.servlet.http.HttpServletRequest req = mock(jakarta.servlet.http.HttpServletRequest.class);
        jakarta.servlet.http.HttpServletResponse res = mock(jakarta.servlet.http.HttpServletResponse.class);
        jakarta.servlet.FilterChain chain = mock(jakarta.servlet.FilterChain.class);
        java.io.StringWriter sw = new java.io.StringWriter();
        java.io.PrintWriter pw = new java.io.PrintWriter(sw);

        when(req.getRequestURI()).thenReturn("/api/auth/login");
        when(req.getMethod()).thenReturn("POST");
        when(req.getRemoteAddr()).thenReturn("192.168.1.100");
        when(res.getWriter()).thenReturn(pw);

        // 5 allowed attempts
        for (int i = 0; i < 5; i++) {
            filter.doFilter(req, res, chain);
        }
        verify(chain, times(5)).doFilter(req, res);

        // 6th attempt should trigger 429 and NOT proceed to chain
        filter.doFilter(req, res, chain);
        verify(chain, times(5)).doFilter(req, res); // not called 6th time
        verify(res).setStatus(429);
        verify(res).setHeader("Retry-After", "60");
        assertTrue(sw.toString().contains("Too many login attempts"));
    }

    @Test
    @DisplayName("JwtUtil throws fatal exception in production when default JWT secret is used")
    void testJwtUtilThrowsInProductionWithDefaultSecret() {
        JwtUtil util = new JwtUtil();
        org.springframework.mock.env.MockEnvironment env = new org.springframework.mock.env.MockEnvironment();
        env.setActiveProfiles("prod");
        org.springframework.test.util.ReflectionTestUtils.setField(util, "environment", env);
        org.springframework.test.util.ReflectionTestUtils.setField(util, "jwtSecretString", JwtUtil.DEFAULT_JWT_SECRET);

        IllegalStateException ex = assertThrows(IllegalStateException.class, util::validateSecretConfiguration);
        assertTrue(ex.getMessage().contains("Running in production with default fallback JWT_SECRET is prohibited"));
    }

    @Test
    @DisplayName("EncryptionService throws fatal exception in production when default master key is used")
    void testEncryptionServiceThrowsInProductionWithDefaultKey() {
        EncryptionService enc = new EncryptionService();
        org.springframework.mock.env.MockEnvironment env = new org.springframework.mock.env.MockEnvironment();
        env.setActiveProfiles("production");
        org.springframework.test.util.ReflectionTestUtils.setField(enc, "environment", env);
        org.springframework.test.util.ReflectionTestUtils.setField(enc, "masterKeyString", EncryptionService.DEFAULT_MASTER_KEY);

        IllegalStateException ex = assertThrows(IllegalStateException.class, enc::validateKeyConfiguration);
        assertTrue(ex.getMessage().contains("Running in production with default fallback APP_MASTER_KEY is prohibited"));
    }

    @Test
    @DisplayName("TokenBlacklistService invalidates JWT token upon logout")
    void testTokenBlacklistServiceAndJwtInvalidation() {
        JwtUtil util = new JwtUtil();
        com.cyberops.security.TokenBlacklistService blacklistService = new com.cyberops.security.TokenBlacklistService();
        org.springframework.test.util.ReflectionTestUtils.setField(util, "jwtSecretString", "MySuperSecretKeyForTestingJwt1234567890!");
        org.springframework.test.util.ReflectionTestUtils.setField(util, "jwtExpirationMs", 3600000L);
        org.springframework.test.util.ReflectionTestUtils.setField(util, "tokenBlacklistService", blacklistService);
        util.init();

        String token = util.generateToken(99L, "logout@test.com");
        assertTrue(util.validateToken(token));
        assertFalse(blacklistService.isBlacklisted(token));

        // Blacklist the token
        long expiry = util.getExpirationTimeFromToken(token);
        blacklistService.blacklistToken(token, expiry);

        // Verification: token is blacklisted and validateToken returns false
        assertTrue(blacklistService.isBlacklisted(token));
        assertFalse(util.validateToken(token));
    }
}
