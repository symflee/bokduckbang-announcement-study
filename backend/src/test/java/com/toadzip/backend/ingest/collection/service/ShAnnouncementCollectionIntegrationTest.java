package com.toadzip.backend.ingest.collection.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doReturn;

import com.toadzip.backend.ingest.collection.domain.ExternalDataSource;
import com.toadzip.backend.ingest.collection.repository.ShAnnouncementExternalRepository;
import com.toadzip.backend.ingest.collection.repository.ShAnnouncementSourceRepository;
import com.toadzip.backend.ingest.failure.domain.ExternalDataFailureStatus;
import com.toadzip.backend.ingest.failure.repository.ExternalDataCollectionFailureRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.jsoup.Jsoup;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(properties = {"ingest.sh.request-interval=0s", "ingest.sh.lookback-days=0"})
@ActiveProfiles("test")
class ShAnnouncementCollectionIntegrationTest {

    @Autowired
    private ShAnnouncementCollectionService service;
    @Autowired
    private ShAnnouncementSourceRepository sources;
    @Autowired
    private ExternalDataCollectionFailureRepository failures;
    @Autowired
    private JdbcClient jdbc;
    @MockitoBean
    private ShAnnouncementExternalRepository externalRepository;

    @AfterEach
    void cleanUp() {
        sources.deleteAll();
        failures.deleteAll();
    }

    @Test
    void collectionStoresContentAndParsingFailurePreservesItUntilSuccessfulRetry() throws IOException {
        String detail = fixture("detail-310653.html");
        when(externalRepository.fetchList(1)).thenReturn(singlePostList());
        when(externalRepository.fetchDetail("310653")).thenReturn(detail);
        long announcementCount = count("announcements");
        long housingCount = count("housing_complexes");

        assertThat(service.collect().storedRowCount()).isOne();
        var first = sources.findBySourceKey("SH:310653").orElseThrow();
        Long sourceId = first.getId();
        assertThat(first.getBodyText()).contains("신혼", "신생아").doesNotContain("<table", "\t", "\r");
        assertThat(first.getAttachments()).contains("fileSeq", "공고문");

        when(externalRepository.fetchDetail("310653")).thenReturn("<html>변경된 구조</html>");
        assertThat(service.collect().failedRequestCount()).isOne();
        var preserved = sources.findBySourceKey("SH:310653").orElseThrow();
        assertThat(preserved.getBodyText()).isEqualTo(first.getBodyText());
        assertThat(preserved.getAttachments()).isEqualTo(first.getAttachments());
        assertThat(preserved.getCollectedAt()).isEqualTo(first.getCollectedAt());
        assertThat(failures.findAllBySourceAndRequestDescriptionAndStatus(
                ExternalDataSource.SH_ANNOUNCEMENT, "seq=310653", ExternalDataFailureStatus.PENDING)).hasSize(1);

        doReturn(detail).when(externalRepository).fetchDetail("310653");
        assertThat(service.collect().failedRequestCount()).isZero();
        var refreshed = sources.findBySourceKey("SH:310653").orElseThrow();
        assertThat(refreshed.getId()).isEqualTo(sourceId);
        assertThat(refreshed.getBodyText()).isEqualTo(first.getBodyText());
        assertThat(failures.findAllBySourceAndRequestDescriptionAndStatus(
                ExternalDataSource.SH_ANNOUNCEMENT, "seq=310653", ExternalDataFailureStatus.RESOLVED)).hasSize(1);
        assertThat(count("announcements")).isEqualTo(announcementCount);
        assertThat(count("housing_complexes")).isEqualTo(housingCount);
    }

    private long count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }

    private String singlePostList() throws IOException {
        var document = Jsoup.parse(fixture("list.html"));
        var rowElement = document.select("#listTb > table > tbody > tr").get(5);
        var detail = Jsoup.parse(fixture("detail-310653.html"));
        rowElement.selectFirst("td.txtL a").text(detail.selectFirst(".firgs0401Table > table > thead th").text());
        rowElement.select("td").get(3).text("2026-09-30");
        String row = rowElement.outerHtml();
        return "<input name='multi_itm_seq' value='2'><div class='topTxt'><p>총 <strong>1</strong> 건 [1/1페이지]"
                + "</p></div><div id='listTb'><table><tbody>" + row + "</tbody></table></div>";
    }

    private String fixture(String name) throws IOException {
        try (var input = getClass().getResourceAsStream("/ingest/sh/" + name)) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
