package com.cyberops.repository;

import com.cyberops.model.ServerGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ServerGroupRepository extends JpaRepository<ServerGroup, Long> {
    List<ServerGroup> findByUserId(Long userId);
    Optional<ServerGroup> findByUserIdAndName(Long userId, String name);
    Optional<ServerGroup> findByIdAndUserId(Long id, Long userId);
}
