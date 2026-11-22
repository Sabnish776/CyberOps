package com.cyberops;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CyberOpsApplication {

    public static void main(String[] args) {
        SpringApplication.run(CyberOpsApplication.class, args);
    }
}
