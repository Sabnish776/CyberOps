package com.cyberops.service;

import com.cyberops.dto.DatabaseQueryDtos.DatabaseQueryRequest;
import com.cyberops.dto.DatabaseQueryDtos.DatabaseQueryResponse;
import com.cyberops.model.Credential;
import com.cyberops.model.ServerProfile;
import com.cyberops.repository.CredentialRepository;
import com.cyberops.repository.ServerProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.sshd.client.channel.ChannelExec;
import org.apache.sshd.client.session.ClientSession;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class DatabaseService {

    private final SshClientService sshClientService;
    private final ServerProfileRepository serverRepository;
    private final CredentialRepository credentialRepository;
    private final EncryptionService encryptionService;

    @org.springframework.beans.factory.annotation.Value("${app.ssh.channel-open-timeout-ms:30000}")
    private long channelOpenTimeoutMs;

    @org.springframework.beans.factory.annotation.Value("${app.ssh.exec-timeout-ms:30000}")
    private long execTimeoutMs;

    public DatabaseQueryResponse executeQuery(Long serverId, Long userId, DatabaseQueryRequest request) {
        ServerProfile server = serverRepository.findByIdAndUserId(serverId, userId)
                .orElseThrow(() -> new IllegalArgumentException("Server not found"));

        validateQueryRequest(request);

        long startTime = System.currentTimeMillis();

        String password = null;
        String privateKey = null;
        String passphrase = null;

        if (server.getCredentialId() != null) {
            Credential credential = credentialRepository.findByIdAndUserId(server.getCredentialId(), userId).orElse(null);
            if (credential != null) {
                String decrypted = encryptionService.decrypt(credential.getEncryptedData());
                if ("KEY".equalsIgnoreCase(credential.getType())) {
                    privateKey = decrypted;
                } else {
                    password = decrypted;
                }
            }
        }

        try (ClientSession session = sshClientService.createSession(server, password, privateKey, passphrase)) {
            String remoteCommand = buildRemoteCommand(request);
            log.info("Executing database query on server {} for service {}", server.getName(), request.getServiceType());

            try (ChannelExec channel = session.createExecChannel(remoteCommand)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                ByteArrayOutputStream err = new ByteArrayOutputStream();
                channel.setOut(out);
                channel.setErr(err);

                // Securely pipe query via stdin so the bash shell never interprets quotes, variables, or subshells
                byte[] queryBytes = (request.getQuery().trim() + "\n").getBytes(StandardCharsets.UTF_8);
                channel.setIn(new java.io.ByteArrayInputStream(queryBytes));

                channel.open().verify(channelOpenTimeoutMs, TimeUnit.MILLISECONDS);
                channel.waitFor(EnumSet.of(org.apache.sshd.client.channel.ClientChannelEvent.CLOSED), execTimeoutMs);

                long duration = System.currentTimeMillis() - startTime;
                String output = out.toString(StandardCharsets.UTF_8).trim();
                String error = err.toString(StandardCharsets.UTF_8).trim();

                if (!error.isEmpty() && output.isEmpty()) {
                    return DatabaseQueryResponse.builder()
                            .success(false)
                            .error(error)
                            .executionTimeMs(duration)
                            .build();
                }

                return parseTabularOutput(output, duration, request.getServiceType());
            }
        } catch (Exception e) {
            log.error("Database query execution failed: {}", e.getMessage());
            return DatabaseQueryResponse.builder()
                    .success(false)
                    .error(e.getMessage() != null ? e.getMessage() : "Failed to execute query")
                    .executionTimeMs(System.currentTimeMillis() - startTime)
                    .build();
        }
    }

    private void validateQueryRequest(DatabaseQueryRequest req) {
        if (req.getQuery() == null || req.getQuery().isBlank()) {
            throw new IllegalArgumentException("Query cannot be blank");
        }
        if (req.getUsername() != null && !req.getUsername().isBlank()) {
            if (!req.getUsername().matches("^[a-zA-Z0-9_.-]+$")) {
                throw new IllegalArgumentException("Invalid username: contains disallowed characters");
            }
        }
        if (req.getDatabaseName() != null && !req.getDatabaseName().isBlank()) {
            if (!req.getDatabaseName().matches("^[a-zA-Z0-9_.-]+$")) {
                throw new IllegalArgumentException("Invalid database name: contains disallowed characters");
            }
        }
        if (req.getPort() != null && (req.getPort() < 1 || req.getPort() > 65535)) {
            throw new IllegalArgumentException("Invalid port number: must be between 1 and 65535");
        }
        if (req.getPassword() != null && (req.getPassword().contains("\n") || req.getPassword().contains("\r") || req.getPassword().contains("\0"))) {
            throw new IllegalArgumentException("Invalid password: newline or null characters not permitted");
        }
    }

    private String buildRemoteCommand(DatabaseQueryRequest req) {
        String type = req.getServiceType() != null ? req.getServiceType().toUpperCase() : "";

        switch (type) {
            case "MYSQL": {
                StringBuilder sb = new StringBuilder("mysql ");
                if (req.getUsername() != null && !req.getUsername().isBlank()) {
                    sb.append("-u ").append(req.getUsername().trim()).append(" ");
                } else {
                    sb.append("-u root ");
                }

                if (req.getPassword() != null && !req.getPassword().isBlank()) {
                    String safePwd = req.getPassword().replace("'", "'\\''");
                    sb.append("-p'").append(safePwd).append("' ");
                }
                if (req.getPort() != null) {
                    sb.append("-P ").append(req.getPort()).append(" ");
                }
                if (req.getDatabaseName() != null && !req.getDatabaseName().isBlank()) {
                    sb.append("-D ").append(req.getDatabaseName().trim()).append(" ");
                }

                // Batch, tab-delimited, unescaped raw output; statements read from stdin
                sb.append("--batch --raw");
                return sb.toString();
            }
            case "POSTGRES": {
                StringBuilder sb = new StringBuilder();
                if (req.getPassword() != null && !req.getPassword().isBlank()) {
                    String safePwd = req.getPassword().replace("'", "'\\''");
                    sb.append("PGPASSWORD='").append(safePwd).append("' ");
                }
                sb.append("psql ");
                if (req.getUsername() != null && !req.getUsername().isBlank()) {
                    sb.append("-U ").append(req.getUsername().trim()).append(" ");
                } else {
                    sb.append("-U postgres ");
                }

                if (req.getPort() != null) {
                    sb.append("-p ").append(req.getPort()).append(" ");
                }
                if (req.getDatabaseName() != null && !req.getDatabaseName().isBlank()) {
                    sb.append("-d ").append(req.getDatabaseName().trim()).append(" ");
                }

                // Read SQL statements from stdin
                sb.append("-f -");
                return sb.toString();
            }
            case "REDIS": {
                StringBuilder sb = new StringBuilder("redis-cli ");
                if (req.getPort() != null) {
                    sb.append("-p ").append(req.getPort()).append(" ");
                }
                if (req.getPassword() != null && !req.getPassword().isBlank()) {
                    String safePwd = req.getPassword().replace("'", "'\\''");
                    sb.append("-a '").append(safePwd).append("' ");
                }
                // redis-cli reads commands from stdin
                return sb.toString();
            }
            default:
                throw new IllegalArgumentException("Unsupported database service type: " + req.getServiceType());
        }
    }

    private DatabaseQueryResponse parseTabularOutput(String raw, long durationMs, String serviceType) {
        if (raw.isBlank()) {
            return DatabaseQueryResponse.builder()
                    .success(true)
                    .columns(List.of("Result"))
                    .rows(List.of(List.of("Query executed successfully. (0 rows returned)")))
                    .rowCount(0)
                    .executionTimeMs(durationMs)
                    .rawOutput(raw)
                    .build();
        }

        String[] lines = raw.split("\r?\n");
        List<String> columns = new ArrayList<>();
        List<List<String>> rows = new ArrayList<>();

        if ("REDIS".equalsIgnoreCase(serviceType)) {
            columns.add("Output");
            for (String line : lines) {
                rows.add(List.of(line));
            }
        } else {
            // Tab-separated or column-aligned
            String headerLine = lines[0];
            String delimiter = headerLine.contains("\t") ? "\t" : "\\s{2,}";
            String[] cols = headerLine.split(delimiter);
            for (String col : cols) {
                if (!col.trim().isEmpty()) columns.add(col.trim());
            }

            for (int i = 1; i < lines.length; i++) {
                String line = lines[i].trim();
                if (line.isEmpty() || line.startsWith("(") || line.startsWith("----")) continue;
                String[] values = line.split(delimiter);
                List<String> row = new ArrayList<>();
                for (String v : values) {
                    row.add(v.trim());
                }
                while (row.size() < columns.size()) {
                    row.add("");
                }
                rows.add(row);
            }
        }

        return DatabaseQueryResponse.builder()
                .success(true)
                .columns(columns)
                .rows(rows)
                .rowCount(rows.size())
                .executionTimeMs(durationMs)
                .rawOutput(raw)
                .build();
    }
}
