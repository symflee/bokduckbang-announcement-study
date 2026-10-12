package com.toadzip.backend.global.config;

import io.micrometer.observation.ObservationRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Scope;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
public class RestClientConfiguration {

    @Bean
    @Scope("prototype")
    public RestClient.Builder restClientBuilder(ObservationRegistry observations) {
        return RestClient.builder().observationRegistry(observations);
    }
}
