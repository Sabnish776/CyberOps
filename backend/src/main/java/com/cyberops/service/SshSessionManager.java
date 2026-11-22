package com.cyberops.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.cyberops.model.SessionRecord;
import com.cyberops.repository.SessionRecordRepository;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.apache.sshd.client.channel.ChannelShell;
import org.apache.sshd.client.session.ClientSession;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class SshSessionManager {

    private final SessionRecordRepository sessionRecordRepository;
    private final AuditService auditService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<String, ActiveSshSession> activeSessions = new ConcurrentHashMap<>();
    private final ExecutorService ioExecutor = Executors.newCachedThreadPool();

    @org.springframework.beans.factory.annotation.Value("${app.ssh.channel-open-timeout-ms:30000}")
    private long channelOpenTimeoutMs;

    @org.springframework.beans.factory.annotation.Value("${app.ssh.detached-timeout-ms:600000}")
    private long detachedTimeoutMs;

    @Getter
    @Setter
    public static class ActiveSshSession {
        private String sessionId;
        private Long userId;
        private Long serverId;
        private String serverName;
        private ClientSession clientSession;
        private ChannelShell shellChannel;
        private OutputStream remoteIn;
        private InputStream remoteOut;
        private WebSocketSession wsSession;
        private Future<?> readTask;
        private volatile boolean open = true;
        private volatile Long detachedAt;
        private volatile long lastActivityAt = System.currentTimeMillis();
    }

    public ActiveSshSession registerSession(String sessionId, Long userId, Long serverId, String serverName, ClientSession clientSession) {
        ActiveSshSession session = new ActiveSshSession();
        session.setSessionId(sessionId);
        session.setUserId(userId);
        session.setServerId(serverId);
        session.setServerName(serverName);
        session.setClientSession(clientSession);

        activeSessions.put(sessionId, session);
        return session;
    }

    public ActiveSshSession getSession(String sessionId) {
        return activeSessions.get(sessionId);
    }

    public boolean isAuthorized(String sessionId, Long userId) {
        if (sessionId == null || userId == null) return false;
        ActiveSshSession session = activeSessions.get(sessionId);
        if (session != null) {
            return userId.equals(session.getUserId());
        }
        return sessionRecordRepository.findById(sessionId)
                .map(r -> userId.equals(r.getUserId()))
                .orElse(false);
    }

    public synchronized void attachWebSocket(String sessionId, WebSocketSession wsSession) throws Exception {
        ActiveSshSession session = activeSessions.get(sessionId);
        if (session == null) {
            throw new IllegalArgumentException("Session not found or expired: " + sessionId);
        }

        session.setWsSession(wsSession);
        session.setDetachedAt(null);
        session.setLastActivityAt(System.currentTimeMillis());

        // Open PTY Shell Channel if not already opened
        if (session.getShellChannel() == null || !session.getShellChannel().isOpen()) {
            ChannelShell shell = session.getClientSession().createShellChannel();
            shell.setPtyType("xterm-256color");
            shell.setPtyColumns(120);
            shell.setPtyLines(30);
            shell.setPtyWidth(120 * 8);
            shell.setPtyHeight(30 * 16);

            // Configure standard PTY modes for immediate echo and raw terminal interaction
            Map<org.apache.sshd.common.channel.PtyMode, Integer> modes = new HashMap<>();
            modes.put(org.apache.sshd.common.channel.PtyMode.ECHO, 1);
            modes.put(org.apache.sshd.common.channel.PtyMode.ICANON, 1);
            modes.put(org.apache.sshd.common.channel.PtyMode.ISIG, 1);
            modes.put(org.apache.sshd.common.channel.PtyMode.ICRNL, 1);
            modes.put(org.apache.sshd.common.channel.PtyMode.ONLCR, 1);
            shell.setPtyModes(modes);

            log.info("Opening PTY shell channel for session {} with timeout {}ms...", sessionId, channelOpenTimeoutMs);
            shell.open().verify(channelOpenTimeoutMs, TimeUnit.MILLISECONDS);

            session.setShellChannel(shell);
            OutputStream remoteIn = shell.getInvertedIn();
            if (remoteIn instanceof org.apache.sshd.common.channel.ChannelOutputStream channelOut) {
                channelOut.setNoDelay(true); // Disable buffering for instant keystroke dispatch
            }
            session.setRemoteIn(remoteIn);
            session.setRemoteOut(shell.getInvertedOut());

            // Start async background stream reader from SSH to WebSocket
            Future<?> reader = ioExecutor.submit(() -> streamOutputToWebSocket(session));
            session.setReadTask(reader);

            // Update session record in database
            sessionRecordRepository.findById(sessionId).ifPresent(record -> {
                record.setStatus("ACTIVE");
                record.setConnectedAt(OffsetDateTime.now());
                sessionRecordRepository.save(record);
            });

            auditService.recordEvent(session.getUserId(), session.getServerName(), "SSH_CONNECT", "SUCCESS", "Shell session attached to WebSocket");
        }

        // Send CONNECTED status message on every attach/reattach
        sendWsMessage(wsSession, Map.of("type", "STATUS", "status", "CONNECTED"));
    }

    public void detachWebSocket(String sessionId, WebSocketSession wsSession) {
        ActiveSshSession session = activeSessions.get(sessionId);
        if (session != null && session.getWsSession() == wsSession) {
            session.setWsSession(null);
            session.setDetachedAt(System.currentTimeMillis());
            log.info("Detached WebSocket from session: {}", sessionId);
        }
    }

    public void handleInput(String sessionId, String data) {
        ActiveSshSession session = activeSessions.get(sessionId);
        if (session != null && session.getRemoteIn() != null && session.isOpen()) {
            session.setLastActivityAt(System.currentTimeMillis());
            try {
                session.getRemoteIn().write(data.getBytes(StandardCharsets.UTF_8));
                session.getRemoteIn().flush();
            } catch (IOException e) {
                log.warn("Error sending stdin data to session {}: {}", sessionId, e.getMessage());
            }
        }
    }

    public void handleResize(String sessionId, int cols, int rows) {
        if (cols < 20 || rows < 5 || cols > 1000 || rows > 500) {
            log.warn("Rejected invalid terminal resize for session {}: {}x{}", sessionId, cols, rows);
            return;
        }

        ActiveSshSession session = activeSessions.get(sessionId);
        if (session != null && session.getShellChannel() != null && session.getShellChannel().isOpen()) {
            try {
                int width = cols * 8;
                int height = rows * 16;
                session.getShellChannel().sendWindowChange(cols, rows, width, height);
                log.debug("Resized session {} terminal to {} cols x {} rows", sessionId, cols, rows);
            } catch (IOException e) {
                log.warn("Error resizing terminal for session {}: {}", sessionId, e.getMessage());
            }
        }
    }

    public void terminateSession(String sessionId, Long userId) {
        ActiveSshSession session = activeSessions.get(sessionId);
        if (session != null) {
            if (userId != null && !session.getUserId().equals(userId)) {
                throw new SecurityException("Unauthorized access to terminate session: " + sessionId);
            }
            cleanupSession(sessionId, "CLOSED");
        }
    }

    public void cleanupSession(String sessionId, String finalStatus) {
        ActiveSshSession session = activeSessions.remove(sessionId);
        if (session == null) return;

        session.setOpen(false);

        if (session.getReadTask() != null) {
            session.getReadTask().cancel(true);
        }

        try {
            if (session.getRemoteIn() != null) session.getRemoteIn().close();
        } catch (Exception ignored) {}

        try {
            if (session.getShellChannel() != null && session.getShellChannel().isOpen()) {
                session.getShellChannel().close(false);
            }
        } catch (Exception ignored) {}

        try {
            if (session.getClientSession() != null && session.getClientSession().isOpen()) {
                session.getClientSession().close(false);
            }
        } catch (Exception ignored) {}

        if (session.getWsSession() != null && session.getWsSession().isOpen()) {
            try {
                sendWsMessage(session.getWsSession(), Map.of("type", "STATUS", "status", "DISCONNECTED"));
                session.getWsSession().close();
            } catch (Exception ignored) {}
        }

        sessionRecordRepository.findById(sessionId).ifPresent(record -> {
            record.setStatus(finalStatus);
            record.setDisconnectedAt(OffsetDateTime.now());
            sessionRecordRepository.save(record);
        });

        auditService.recordEvent(session.getUserId(), session.getServerName(), "SSH_DISCONNECT", "SUCCESS", "Session terminated with status: " + finalStatus);
        log.info("Cleaned up SSH session: {}", sessionId);
    }

    private void streamOutputToWebSocket(ActiveSshSession session) {
        byte[] buffer = new byte[8192];
        try (InputStream in = session.getRemoteOut()) {
            int bytesRead;
            while (session.isOpen() && (bytesRead = in.read(buffer)) != -1) {
                String text = new String(buffer, 0, bytesRead, StandardCharsets.UTF_8);
                if (session.getWsSession() != null && session.getWsSession().isOpen()) {
                    sendWsMessage(session.getWsSession(), Map.of("type", "OUTPUT", "data", text));
                }
            }
        } catch (Exception e) {
            if (session.isOpen()) {
                log.debug("Output stream ended for session {}: {}", session.getSessionId(), e.getMessage());
            }
        } finally {
            cleanupSession(session.getSessionId(), "CLOSED");
        }
    }

    private void sendWsMessage(WebSocketSession wsSession, Map<String, Object> payload) {
        if (wsSession == null || !wsSession.isOpen()) return;
        try {
            String json = objectMapper.writeValueAsString(payload);
            synchronized (wsSession) {
                if (wsSession.isOpen()) {
                    wsSession.sendMessage(new TextMessage(json));
                }
            }
        } catch (IOException e) {
            log.warn("Failed to send WebSocket message: {}", e.getMessage());
        }
    }

    @org.springframework.scheduling.annotation.Scheduled(fixedRate = 60000)
    public void reapOrphanedSessions() {
        long now = System.currentTimeMillis();
        for (ActiveSshSession session : activeSessions.values()) {
            String sid = session.getSessionId();
            // Case 1: WebSocket detached longer than timeout (orphaned tab/window)
            if (session.getWsSession() == null && session.getDetachedAt() != null) {
                if (now - session.getDetachedAt() > detachedTimeoutMs) {
                    log.warn("Reaping orphaned detached SSH session {} (detached for {}s)", sid, (now - session.getDetachedAt()) / 1000);
                    cleanupSession(sid, "DISCONNECTED");
                    continue;
                }
            }
            // Case 2: Underlying SSH client session terminated or closed from server side
            if (session.getClientSession() == null || !session.getClientSession().isOpen()) {
                log.info("Cleaning up dead SSH session {} (ClientSession is closed)", sid);
                cleanupSession(sid, "CLOSED");
            }
        }
    }

    @jakarta.annotation.PreDestroy
    public void cleanupAll() {
        log.info("Shutting down SshSessionManager: closing all {} active SSH sessions...", activeSessions.size());
        for (String sessionId : new java.util.HashSet<>(activeSessions.keySet())) {
            try {
                cleanupSession(sessionId, "CLOSED");
            } catch (Exception ignored) {}
        }
        ioExecutor.shutdownNow();
    }

    public void terminateSessionsForServer(Long serverId) {
        if (serverId == null) return;
        for (ActiveSshSession session : new java.util.ArrayList<>(activeSessions.values())) {
            if (serverId.equals(session.getServerId())) {
                log.info("Terminating active session {} for server {}", session.getSessionId(), serverId);
                cleanupSession(session.getSessionId(), "CLOSED");
            }
        }
        List<SessionRecord> records = sessionRecordRepository.findByServerId(serverId);
        for (SessionRecord record : records) {
            if (!"CLOSED".equalsIgnoreCase(record.getStatus()) && !"DISCONNECTED".equalsIgnoreCase(record.getStatus())) {
                record.setStatus("CLOSED");
                record.setDisconnectedAt(OffsetDateTime.now());
                sessionRecordRepository.save(record);
            }
        }
    }

    public Map<String, ActiveSshSession> getActiveSessions() {
        return activeSessions;
    }
}
