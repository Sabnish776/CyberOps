package com.cyberops.controller;

import com.cyberops.dto.SessionDtos.SessionResponse;
import com.cyberops.model.ServerProfile;
import com.cyberops.model.SessionRecord;
import com.cyberops.repository.ServerProfileRepository;
import com.cyberops.repository.SessionRecordRepository;
import com.cyberops.security.UserPrincipal;
import com.cyberops.service.SshSessionManager;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/sessions")
@RequiredArgsConstructor
public class SessionController {

    private final SessionRecordRepository sessionRecordRepository;
    private final ServerProfileRepository serverRepository;
    private final SshSessionManager sshSessionManager;

    @GetMapping
    public ResponseEntity<List<SessionResponse>> listSessions(@AuthenticationPrincipal UserPrincipal principal) {
        List<SessionRecord> records = sessionRecordRepository.findByUserIdOrderByCreatedAtDesc(principal.getId());

        List<SessionResponse> responses = records.stream().map(rec -> {
            ServerProfile server = serverRepository.findById(rec.getServerId()).orElse(null);
            return SessionResponse.builder()
                    .id(rec.getId())
                    .serverId(rec.getServerId())
                    .serverName(server != null ? server.getName() : "Unknown")
                    .serverHostname(server != null ? server.getHostname() : "Unknown")
                    .status(rec.getStatus())
                    .createdAt(rec.getCreatedAt())
                    .connectedAt(rec.getConnectedAt())
                    .disconnectedAt(rec.getDisconnectedAt())
                    .build();
        }).collect(Collectors.toList());

        return ResponseEntity.ok(responses);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> terminateSession(@AuthenticationPrincipal UserPrincipal principal,
                                              @PathVariable String id) {
        sshSessionManager.terminateSession(id, principal.getId());
        return ResponseEntity.ok(Map.of("message", "Session terminated successfully"));
    }
}
