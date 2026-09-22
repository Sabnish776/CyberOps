package com.cyberops.controller;

import com.cyberops.dto.MonitoringDtos.ServerMetricsDto;
import com.cyberops.model.ServerProfile;
import com.cyberops.repository.ServerProfileRepository;
import com.cyberops.security.UserPrincipal;
import com.cyberops.service.MonitoringService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/servers/{id}/monitoring")
@RequiredArgsConstructor
public class MonitoringController {

    private final MonitoringService monitoringService;
    private final ServerProfileRepository serverRepository;

    @GetMapping
    public ResponseEntity<ServerMetricsDto> getMetrics(@AuthenticationPrincipal UserPrincipal principal,
                                                       @PathVariable Long id) {
        ServerProfile server = serverRepository.findByIdAndUserId(id, principal.getId())
                .orElseThrow(() -> new IllegalArgumentException("Server not found"));

        ServerMetricsDto metrics = monitoringService.getMetrics(server, principal.getId());
        return ResponseEntity.ok(metrics);
    }
}
