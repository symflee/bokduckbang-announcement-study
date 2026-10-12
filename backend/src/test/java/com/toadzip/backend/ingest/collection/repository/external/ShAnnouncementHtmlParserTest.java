package com.toadzip.backend.ingest.collection.repository.external;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.toadzip.backend.ingest.collection.dto.ShAnnouncementContent;
import com.toadzip.backend.ingest.collection.dto.ShAnnouncementPage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import org.jsoup.Jsoup;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

class ShAnnouncementHtmlParserTest {

    private final ShAnnouncementListParser lists = new ShAnnouncementListParser();
    private final ShAnnouncementHtmlParser parser = new ShAnnouncementHtmlParser();

    @Test
    void producesReadableParagraphsAndTableRowsWithoutFormattingNoise() throws IOException {
        var entry = listEntry("311087");
        var document = Jsoup.parse(fixture("detail-main-311087.html"));
        document.select("td.cont").first().html("""
                <p>  첫째&nbsp; 문단 </p><p>둘째<br>줄바꿈</p>
                <table><tr><th>단지</th><th>공급호수</th></tr><tr><td>가람</td><td>37호</td></tr></table>
                <script>noise()</script><style>.noise { color: red; }</style>
                """);
        String text = parser.parse(document.html(), entry.seq(), entry.title(), entry.registeredDate()).bodyText();
        assertThat(text).contains("첫째 문단", "둘째\n줄바꿈", "단지 공급호수", "가람 37호");
        assertThat(text).doesNotContain("<", "noise", "\t", "\r", "\n\n\n", "  ");
        assertThat(text).isEqualTo(text.strip());
    }

    @Test
    void parsesMainBoardDetailAndRejectsDifferentSequence() throws IOException {
        String html = fixture("detail-main-311087.html");
        var result = parseDetail(html, listEntry("311087"));
        assertThat(result.bodyText()).contains("7개소 37호실");
        assertThat(result.attachments()).contains("모집 공고문.pdf", "신청서.zip");
        assertThatThrownBy(() -> parser.parse(html, "123", result.title(), result.registeredDate()))
                .isInstanceOf(ExternalDataRequestException.class);
    }

    @Test
    void imageOnlyBodyAndExplicitlyEmptyAttachmentsAreValidWithoutInventingStructuredFields() throws IOException {
        var entry = listEntry("311087");
        var html = Jsoup.parse(fixture("detail-main-311087.html"));
        html.select("td.cont").first().html("<img src='/notice.png' alt=''>");
        html.select("a.btnAttach").remove();
        html.select("script:not([src])").first().html("initParam.downList = [];");

        var parsed = parser.parse(html.html(), entry.seq(), entry.title(), entry.registeredDate());

        assertThat(parsed.title()).isEqualTo(entry.title());
        assertThat(parsed.bodyText()).isEmpty();
        assertThat(parsed.attachments()).isEqualTo("[]");
    }

    @Test
    void mismatchedAttachmentButtonsAndMalformedMetadataAreFailures() throws IOException {
        var entry = listEntry("310653");
        String html = fixture("detail-310653.html");
        var document = Jsoup.parse(html);
        document.select("a.btnAttach").first().remove();
        assertThatThrownBy(() -> parser.parse(document.html(), entry.seq(), entry.title(), entry.registeredDate()))
                .isInstanceOf(ExternalDataRequestException.class).hasMessageContaining("개수");
        assertThatThrownBy(() -> parser.parse(html.replace("initParam.downList = [", "initParam.downList = [INVALID"),
                entry.seq(), entry.title(), entry.registeredDate())).isInstanceOf(ExternalDataRequestException.class);
    }

    @Test
    void 신규게시글의_NEW배지는_제목에서_제외하고_상세와_대조한다() throws IOException {
        var document = Jsoup.parse(fixture("list-main-search.html"));
        document.select("td.txtL > a").getFirst().prepend("<span class='icoNew'>NEW</span> ");
        var entry = lists.parseList(document.html(), 1).entries().getFirst();
        var snapshot = parseDetail(fixture("detail-main-311087.html"), entry);
        assertThat(snapshot.title()).isEqualTo(entry.title()).doesNotStartWith("NEW ");
        assertThat(snapshot.registeredDate()).isEqualTo(LocalDate.of(2026, 10, 8));
    }

    @ParameterizedTest
    @ValueSource(strings = {"GS0401", "DBGS01", "GWJGS01", "GNGS01"})
    void 첨부의_게시판코드를_보존한다(String board) throws IOException {
        var entry = listEntry("310653");
        String html = fixture("detail-310653.html").replace("GS0401", board);
        var snapshot = parseDetail(html, entry);
        var files = JsonMapper.builder().build().readTree(snapshot.attachments());
        assertThat(files).hasSize(6);
        for (var file : files) {
            assertThat(file.path("brdId").asString()).isEqualTo(board);
            assertThat(file.path("seq").asString()).isEqualTo(entry.seq());
            assertThat(file.path("previewUrl").asString()).contains("brd_id=" + board + "&seq=" + entry.seq());
        }
        assertThatThrownBy(() -> parseDetail(html.replace(board, "UNKNOWN"), entry))
                .isInstanceOf(ExternalDataRequestException.class).hasMessageContaining("식별자");
    }

    @Test
    void extractsTextFromNestedBodyTables() throws IOException {
        String html = fixture("detail-311005.html");
        var snapshot = parser.parse(html, "311005",
                "[토지지원 사회주택]에어스페이스 신림3호점_어울리 입주자 모집 공고", LocalDate.of(2026, 10, 2));

        assertThat(snapshot.bodyText()).contains("민간사업자", "soco.seoul.go.kr");
    }

    @Test
    void readsActualFileSeqInsteadOfButtonIndex() throws IOException {
        var entry = listEntry("310653");
        var snapshot = parseDetail(fixture("detail-310653.html"), entry);
        var files = JsonMapper.builder().build().readTree(snapshot.attachments());

        assertThat(files).hasSize(6);
        assertThat(files.get(4).path("fileSeq").asString()).isEqualTo("7");
        assertThat(files.get(4).path("previewUrl").asString()).endsWith("&file_seq=7");
        assertThat(snapshot.department()).isEqualTo("매입주택공급부");
    }

    @Test
    void rejectsDetailForAnotherPostAndMissingAttachmentMetadata() throws IOException {
        var entry = listEntry("311087");
        var otherEntry = listEntry("310653");
        String detail = fixture("detail-main-311087.html");
        assertThatThrownBy(() -> parseDetail(detail, otherEntry))
                .isInstanceOf(ExternalDataRequestException.class).hasMessageContaining("목록과 다릅니다");
        assertThatThrownBy(() -> parseDetail(detail.replace("initParam.downList", "removed"), entry))
                .isInstanceOf(ExternalDataRequestException.class);
        assertThatThrownBy(() -> parseDetail(detail.replace("\"seq\":\"311087\"", "\"seq\":\"999\""), entry))
                .isInstanceOf(ExternalDataRequestException.class)
                .hasMessageContaining("식별자");
    }

    @Test
    void invalidDetailDatesAreRefinementFailures() throws IOException {
        var entry = listEntry("311087");
        String detail = fixture("detail-main-311087.html").replace("2026-10-08", "2026-99-99");
        assertThatThrownBy(() -> parseDetail(detail, entry)).isInstanceOf(ExternalDataRequestException.class);
    }

    private ShAnnouncementPage.Entry listEntry(String seq) throws IOException {
        return lists.parseList(fixture("list-main-search.html"), 1).entries().stream()
                .filter(entry -> entry.seq().equals(seq)).findFirst().orElseThrow();
    }

    private ShAnnouncementContent parseDetail(
            String html, ShAnnouncementPage.Entry entry) {
        return parser.parse(html, entry.seq(), entry.title(), entry.registeredDate());
    }

    private String fixture(String name) throws IOException {
        try (var input = getClass().getResourceAsStream("/ingest/sh/" + name)) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
