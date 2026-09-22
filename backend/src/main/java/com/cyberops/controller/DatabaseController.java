package com.cyberops.controller;

import com.cyberops.dto.DatabaseQueryDtos.DatabaseQueryRequest;
import com.cyberops.dto.DatabaseQueryDtos.DatabaseQueryResponse;
import com.cyberops.security.UserPrincipal;
import com.cyberops.service.DatabaseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/servers/{serverId}/database")
@RequiredArgsConstructor
public class DatabaseController {

    private final DatabaseService databaseService;

    @PostMapping("/query")
    public ResponseEntity<DatabaseQueryResponse> executeQuery(@AuthenticationPrincipal UserPrincipal principal,
                                                              @PathVariable Long serverId,
                                                              @Valid @RequestBody DatabaseQueryRequest request) {
        return ResponseEntity.ok(databaseService.executeQuery(serverId, principal.getId(), request));
    }
}
