package com.cyberops.config;

import com.cyberops.websocket.RemoteDesktopWebSocketHandler;
import com.cyberops.websocket.TerminalWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final TerminalWebSocketHandler terminalWebSocketHandler;
    private final RemoteDesktopWebSocketHandler remoteDesktopWebSocketHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(terminalWebSocketHandler, "/ws/terminal/{sessionId}")
                .setAllowedOrigins("*");
        
        registry.addHandler(remoteDesktopWebSocketHandler, "/ws/desktop/{sessionId}")
                .setAllowedOrigins("*");
    }
}
