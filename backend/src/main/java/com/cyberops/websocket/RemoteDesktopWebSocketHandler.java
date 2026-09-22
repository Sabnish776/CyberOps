package com.cyberops.websocket;

import com.cyberops.service.SshSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.sshd.client.channel.ChannelDirectTcpip;
import org.apache.sshd.client.session.ClientSession;
import org.apache.sshd.common.util.net.SshdSocketAddress;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.BinaryWebSocketHandler;
import org.springframework.web.socket.SubProtocolCapable;

import java.io.InputStream;
import java.io.OutputStream;
import java.io.PushbackInputStream;
import java.net.URI;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Component
@RequiredArgsConstructor
@Slf4j
public class RemoteDesktopWebSocketHandler extends BinaryWebSocketHandler implements SubProtocolCapable {

    private final SshSessionManager sshSessionManager;
    private final ExecutorService ioExecutor = Executors.newCachedThreadPool();

    private final ConcurrentHashMap<String, ChannelDirectTcpip> activeChannels = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, OutputStream> channelOuts = new ConcurrentHashMap<>();

    @Override
    public List<String> getSubProtocols() {
        return Collections.singletonList("binary");
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String sessionId = extractSessionId(session.getUri());
        if (sessionId == null) {
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        SshSessionManager.ActiveSshSession sshSession = sshSessionManager.getSession(sessionId);
        if (sshSession == null || sshSession.getClientSession() == null || !sshSession.getClientSession().isOpen()) {
            log.error("VNC Desktop failed: SSH session not found or closed for id {}", sessionId);
            session.close(CloseStatus.SERVER_ERROR);
            return;
        }

        try {
            ClientSession clientSession = sshSession.getClientSession();
            ChannelDirectTcpip channel = null;
            InputStream channelIn = null;
            OutputStream channelOut = null;
            Exception lastException = null;
            int connectedPort = 0;
            
            for (int port : new int[]{5900, 5901, 5902, 5903}) {
                try {
                    log.info("Attempting VNC connection to port {}", port);
                    channel = clientSession.createDirectTcpipChannel(
                            new SshdSocketAddress("127.0.0.1", 0),
                            new SshdSocketAddress("127.0.0.1", port)
                    );
                    
                    channel.open().verify(5000); // 5s timeout per port
                    
                    PushbackInputStream pbis = new PushbackInputStream(channel.getInvertedOut(), 3);
                    channelIn = pbis;
                    channelOut = channel.getInvertedIn();
                    
                    // Verify this is actually a VNC server by reading the 'RFB' header
                    byte[] rfbHeader = new byte[3];
                    int readBytes = 0;
                    long startTime = System.currentTimeMillis();
                    
                    while (readBytes < 3 && (System.currentTimeMillis() - startTime) < 2000) {
                        if (pbis.available() > 0) {
                            int b = pbis.read();
                            if (b != -1) {
                                rfbHeader[readBytes++] = (byte) b;
                            } else {
                                break;
                            }
                        } else {
                            Thread.sleep(50);
                        }
                    }
                    
                    if (readBytes < 3 || rfbHeader[0] != 'R' || rfbHeader[1] != 'F' || rfbHeader[2] != 'B') {
                        throw new RuntimeException("Not a valid VNC server (RFB header missing)");
                    }
                    
                    pbis.unread(rfbHeader, 0, readBytes);
                    
                    log.info("Successfully established VNC channel on port {}", port);
                    connectedPort = port;
                    break;
                } catch (Exception e) {
                    log.warn("Port {} failed: {}", port, e.getMessage());
                    lastException = e;
                    if (channel != null) {
                        try { channel.close(true); } catch (Exception ignored) {}
                    }
                    channel = null;
                    channelIn = null;
                    channelOut = null;
                }
            }
            
            if (channel == null || channelIn == null || channelOut == null) {
                throw lastException != null ? lastException : new RuntimeException("All VNC ports failed");
            }
            
            final ChannelDirectTcpip finalChannel = channel;
            final InputStream finalIn = channelIn;
            final OutputStream finalOut = channelOut;
            
            activeChannels.put(session.getId(), finalChannel);
            channelOuts.put(session.getId(), finalOut);
            
            ioExecutor.submit(() -> {
                try {
                    byte[] buffer = new byte[8192];
                    int len;
                    while ((len = finalIn.read(buffer)) != -1) {
                        if (session.isOpen()) {
                            byte[] payload = new byte[len];
                            System.arraycopy(buffer, 0, payload, 0, len);
                            synchronized (session) {
                                session.sendMessage(new BinaryMessage(payload));
                            }
                        } else {
                            break;
                        }
                    }
                } catch (Exception e) {
                    log.warn("Remote Desktop stream ended for {}: {}", sessionId, e.getMessage());
                } finally {
                    try {
                        if (session.isOpen()) {
                            session.close();
                        }
                    } catch (Exception ignored) {}
                }
            });
            
            log.info("VNC Desktop connected over SSH for session {}", sessionId);
        } catch (Exception e) {
            log.error("Failed to establish VNC port forward for session {}: {}", sessionId, e.getMessage());
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws Exception {
        OutputStream out = channelOuts.get(session.getId());
        if (out != null) {
            ByteBuffer payload = message.getPayload();
            byte[] bytes = new byte[payload.remaining()];
            payload.get(bytes);
            out.write(bytes);
            out.flush();
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        cleanup(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        cleanup(session.getId());
    }

    private void cleanup(String wsSessionId) {
        channelOuts.remove(wsSessionId);
        ChannelDirectTcpip channel = activeChannels.remove(wsSessionId);
        if (channel != null && channel.isOpen()) {
            try {
                channel.close(false);
            } catch (Exception ignored) {}
        }
    }

    private String extractSessionId(URI uri) {
        if (uri == null) return null;
        String path = uri.getPath();
        if (path == null) return null;
        String[] parts = path.split("/");
        return parts.length > 0 ? parts[parts.length - 1] : null;
    }
}
