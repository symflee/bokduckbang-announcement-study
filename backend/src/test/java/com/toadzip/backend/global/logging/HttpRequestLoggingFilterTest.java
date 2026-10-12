package com.toadzip.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.ServletException;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

class HttpRequestLoggingFilterTest {

    private static final String TRACE_ID = "traceId";

    private final HttpRequestLoggingFilter filter = new HttpRequestLoggingFilter();

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void 요청을_처리하는_동안_traceId를_MDC에_등록하고_완료되면_제거한다() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/test");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> traceIdInRequest = new AtomicReference<>();

        filter.doFilter(request, response, (servletRequest, servletResponse) ->
                traceIdInRequest.set(MDC.get(TRACE_ID)));

        assertThat(traceIdInRequest.get()).isNotBlank();
        assertThat(MDC.get(TRACE_ID)).isNull();
    }

    @Test
    void 요청_처리에서_예외가_발생해도_MDC의_traceId를_제거한다() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/test");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThatThrownBy(() -> filter.doFilter(request, response, (servletRequest, servletResponse) -> {
            throw new ServletException("test failure");
        })).isInstanceOf(ServletException.class);
        assertThat(MDC.get(TRACE_ID)).isNull();
    }

    @Test
    void 요청이_완료되면_method_URI_status_처리시간을_traceId와_함께_기록한다() throws Exception {
        Logger logger = (Logger) LoggerFactory.getLogger(HttpRequestLoggingFilter.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/test");
        MockHttpServletResponse response = new MockHttpServletResponse();

        try {
            filter.doFilter(request, response, (servletRequest, servletResponse) -> response.setStatus(201));

            assertThat(appender.list).singleElement().satisfies(event -> {
                assertThat(event.getFormattedMessage())
                        .contains("event=http.request.completed")
                        .contains("method=POST")
                        .contains("uri=/api/test")
                        .contains("status=201")
                        .contains("route=/api/test")
                        .contains("durationMs=");
                assertThat(event.getMDCPropertyMap()).containsKey(TRACE_ID);
                assertThat(event.getMDCPropertyMap().get(TRACE_ID)).isNotBlank();
            });
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void 실제_MVC_요청의_경로와_API_템플릿을_함께_남기고_쿼리_값은_기록하지_않는다() throws Exception {
        Logger logger = (Logger) LoggerFactory.getLogger(HttpRequestLoggingFilter.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);

        try {
            MockMvcBuilders.standaloneSetup(new LoggingTestController()).addFilters(filter).build()
                    .perform(get("/api/test/42?token=private-token"));

            assertThat(appender.list).singleElement().satisfies(event ->
                    assertThat(event.getFormattedMessage())
                            .contains("uri=/api/test/42", "route=/api/test/{itemId}", "status=200")
                            .doesNotContain("private-token", "token="));
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @RestController
    static class LoggingTestController {

        @GetMapping("/api/test/{itemId}")
        String getItem() {
            return "ok";
        }
    }
}
