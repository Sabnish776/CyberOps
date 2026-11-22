package com.cyberops.security;

import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory sliding window rate limiter service.
 * Tracks request timestamps per key (e.g. action + client IP) and evicts expired windows.
 */
@Service
public class RateLimiterService {

    private final Map<String, Deque<Long>> requestCounts = new ConcurrentHashMap<>();

    /**
     * Checks if a request is allowed under the sliding window rate limit.
     *
     * @param key unique identifier (e.g. "login:192.168.1.1")
     * @param maxRequests maximum allowed requests within window
     * @param windowMs window duration in milliseconds
     * @return true if allowed, false if rate limit exceeded
     */
    public synchronized boolean isAllowed(String key, int maxRequests, long windowMs) {
        long now = System.currentTimeMillis();
        long cutoff = now - windowMs;

        Deque<Long> timestamps = requestCounts.computeIfAbsent(key, k -> new ArrayDeque<>());

        // Evict expired timestamps
        while (!timestamps.isEmpty() && timestamps.peekFirst() <= cutoff) {
            timestamps.pollFirst();
        }

        if (timestamps.size() >= maxRequests) {
            return false;
        }

        timestamps.addLast(now);
        return true;
    }

    /**
     * Clears all recorded entries.
     */
    public synchronized void reset() {
        requestCounts.clear();
    }
}
