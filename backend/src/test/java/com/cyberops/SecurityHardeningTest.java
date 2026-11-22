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
}
