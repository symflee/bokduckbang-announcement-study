package com.toadzip.backend.search.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.toadzip.backend.global.config.RestClientConfiguration;
import com.toadzip.backend.search.domain.LocationSearchType;
import com.toadzip.backend.search.exception.LocationSearchUnavailableException;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.observation.DefaultMeterObservationHandler;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.observation.ObservationRegistry;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

class NaverLocationSearchObservabilityTest {

    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();

    @AfterEach
    void closeMeters() {
        meters.close();
    }

    @Test
    void 주입한_Builder의_관측_설정을_유지하며_검색어를_메트릭_라벨에_넣지_않는다() {
        RestClient.Builder builder = observedBuilder().requestInterceptor((request, body, execution) ->
                jsonResponse("{\"total\":0,\"items\":[]}"));
        NaverLocationSearchRepository repository = repository(builder);

        repository.search("private-search-term", LocationSearchType.SUBWAY_STATION, 0, 5);

        Timer timer = meters.get("http.client.requests").tag("client.name", "openapi.naver.com")
                .tag("status", "200").timer();
        assertThat(timer.count()).isEqualTo(1);
        assertThat(timer.getId().getTags().toString()).doesNotContain("private-search-term", "search-secret");
    }

    @Test
    void 두_기관_클라이언트가_Builder를_공유해도_각_호스트의_호출을_구분한다() {
        RestClient.Builder builder = observedBuilder().requestInterceptor((request, body, execution) -> {
            String response = "{\"total\":0,\"items\":[]}";
            if (request.getURI().getHost().equals("maps.apigw.ntruss.com")) {
                response = "{\"status\":\"OK\",\"meta\":{\"totalCount\":0},\"addresses\":[]}";
            }
            return jsonResponse(response);
        });
        NaverLocationSearchRepository repository = repository(builder);

        repository.search("private-search-term", LocationSearchType.SUBWAY_STATION, 0, 5);
        repository.search("private-region-term", LocationSearchType.REGION, 0, 5);

        assertThat(meters.get("http.client.requests").tag("client.name", "openapi.naver.com").timer().count())
                .isEqualTo(1);
        assertThat(meters.get("http.client.requests").tag("client.name", "maps.apigw.ntruss.com").timer().count())
                .isEqualTo(1);
    }

    @Test
    void 외부_HTTP_실패의_상태와_종류를_기록하고_본문과_인증정보는_노출하지_않는다() {
        Logger logger = (Logger) LoggerFactory.getLogger(NaverLocationSearchRepository.class);
        ListAppender<ILoggingEvent> logs = attach(logger);
        try {
            RestClient.Builder builder = observedBuilder().requestInterceptor((request, body, execution) ->
                    new MockClientHttpResponse("private-upstream-body".getBytes(StandardCharsets.UTF_8),
                            HttpStatus.SERVICE_UNAVAILABLE));

            assertThatThrownBy(() -> repository(builder)
                    .search("private-search-term", LocationSearchType.SUBWAY_STATION, 0, 5))
                    .isInstanceOf(LocationSearchUnavailableException.class);

            assertThat(logs.list).singleElement().satisfies(event -> assertThat(event.getFormattedMessage())
                    .contains("event=external_api.request.failed", "provider=naver", "operation=SUBWAY_STATION",
                            "failure=upstream_http", "upstreamStatus=503", "durationMs=")
                    .doesNotContain("private-upstream-body", "private-search-term", "search-secret"));
            assertThat(meters.get("http.client.requests").tag("status", "503").timer().count()).isEqualTo(1);
        } finally {
            logger.detachAppender(logs);
            logs.stop();
        }
    }

    @Test
    void 시간초과를_외부_HTTP_응답_오류와_구분한다() {
        Logger logger = (Logger) LoggerFactory.getLogger(NaverLocationSearchRepository.class);
        ListAppender<ILoggingEvent> logs = attach(logger);
        try {
            RestClient.Builder builder = RestClient.builder().requestInterceptor((request, body, execution) -> {
                throw new ResourceAccessException("private-search-term", new SocketTimeoutException());
            });

            assertThatThrownBy(() -> repository(builder)
                    .search("private-search-term", LocationSearchType.SUBWAY_STATION, 0, 5))
                    .isInstanceOf(LocationSearchUnavailableException.class);
            assertThat(logs.list).singleElement().satisfies(event -> assertThat(event.getFormattedMessage())
                    .contains("failure=timeout", "upstreamStatus=none")
                    .doesNotContain("private-search-term"));
        } finally {
            logger.detachAppender(logs);
            logs.stop();
        }
    }

    private RestClient.Builder observedBuilder() {
        ObservationRegistry observations = ObservationRegistry.create();
        observations.observationConfig().observationHandler(new DefaultMeterObservationHandler(meters));
        return new RestClientConfiguration().restClientBuilder(observations);
    }

    private MockClientHttpResponse jsonResponse(String json) {
        MockClientHttpResponse response = new MockClientHttpResponse(json.getBytes(StandardCharsets.UTF_8),
                HttpStatus.OK);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        return response;
    }

    private NaverLocationSearchRepository repository(RestClient.Builder builder) {
        return new NaverLocationSearchRepository(builder, "search-id", "search-secret", "maps-id", "maps-secret");
    }

    private ListAppender<ILoggingEvent> attach(Logger logger) {
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
        return logs;
    }
}
