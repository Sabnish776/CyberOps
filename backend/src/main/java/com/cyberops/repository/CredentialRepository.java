package com.cyberops.repository;

import com.cyberops.model.Credential;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CredentialRepository extends JpaRepository<Credential, Long> {
    Optional<Credential> findByIdAndUserId(Long id, Long userId);
    void deleteByIdAndUserId(Long id, Long userId);
}
