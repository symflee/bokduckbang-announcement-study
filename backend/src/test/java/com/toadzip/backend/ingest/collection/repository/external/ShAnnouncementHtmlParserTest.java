package com.toadzip.backend.ingest.collection.repository.external;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.toadzip.backend.ingest.collection.dto.ShAnnouncementPage;
import com.toadzip.backend.ingest.collection.dto.ShAnnouncementContent;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import org.jsoup.Jsoup;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

class ShAnnouncementHtmlParserTest {

    private final ShAnnouncementListParser lists = new ShAnnouncementListParser();
    private final ShAnnouncementHtmlParser parser = new ShAnnouncementHtmlParser();

    @Test
    void producesReadableParagraphsAndTableRowsWithoutFormattingNoise() throws IOException {
        var entry = lists.parseList(fixture("list-page1.html"), 1).entries().getFirst();
        var document = Jsoup.parse(fixture("detail-311005.html"));
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
    void parsesMainBoardDetailAndRejectsDifferentSequence() throws Exception {
        String html;
        try (var input = getClass().getResourceAsStream("/ingest/sh/detail-main-311087.html")) {
            html = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
        var result = parser.parse(html, "311087", "강동구 청년창업가,예술인주택(수요자맞춤형) 잔여세대 모집 공고",
                java.time.LocalDate.of(2026, 10, 8));
        assertThat(result.bodyText()).contains("7개소 37호실");
        assertThat(result.attachments()).contains("모집 공고문.pdf", "신청서.zip");
        assertThatThrownBy(() -> parser.parse(html, "123", result.title(), result.registeredDate()))
                .isInstanceOf(ExternalDataRequestException.class);
    }

    @Test
    void imageOnlyBodyAndExplicitlyEmptyAttachmentsAreValidWithoutInventingStructuredFields() throws IOException {
        var page = lists.parseList(fixture("list-page1.html"), 1);
        var entry = page.entries().getFirst();
        var html = Jsoup.parse(fixture("detail-311005.html"));
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
        var page = lists.parseList(fixture("list-page1.html"), 1);
        var entry = page.entries().stream().filter(row -> row.seq().equals("310653")).findFirst().orElseThrow();
        String html = fixture("detail-310653.html");
        var document = Jsoup.parse(html);
        document.select("a.btnAttach").first().remove();
        assertThatThrownBy(() -> parser.parse(document.html(), entry.seq(), entry.title(), entry.registeredDate()))
                .isInstanceOf(ExternalDataRequestException.class).hasMessageContaining("개수");
        assertThatThrownBy(() -> parser.parse(html.replace("initParam.downList = [", "initParam.downList = [INVALID"),
                entry.seq(), entry.title(), entry.registeredDate())).isInstanceOf(ExternalDataRequestException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"311167", "311004", "311188", "311169", "310976"})
    void 실제_신규게시글의_NEW배지는_제목에서_제외하고_상세와_대조한다(String seq) throws IOException {
        var page = lists.parseList(fixture("list-page1-20261007.html"), 1);
        var entry = page.entries().stream().filter(row -> row.seq().equals(seq)).findFirst().orElseThrow();
        var snapshot = parseDetail(fixture("detail-" + seq + "-20261007.html"), entry);
        assertThat(snapshot.title()).isEqualTo(entry.title()).doesNotStartWith("NEW ");
        assertThat(snapshot.registeredDate()).isEqualTo(LocalDate.of(2026, 10, 7));
    }

    @ParameterizedTest
    @CsvSource(value = {
            "310080|DBGS01|2026-09-09|[도봉서원], [도봉서광] 입주안내문 게시|2",
            "309975|GWJGS01|2026-09-08|리버센sk뷰롯데캐슬 입주안내문|1",
            "307426|DBGS01|2026-07-22|[도봉서원], [도봉서광] 입주안내문 게시|2",
            "307046|GNGS01|2026-07-15|디에이치 대치 에델루이 준공인가증(준공필증)을 게시 합니다|1"
    }, delimiter = '|')
    void 실제_지역센터_첨부의_게시판코드를_보존한다(String seq, String board, String date, String title, int count)
            throws IOException {
        var page = lists.parseList(fixture("list-page1-20261007.html"), 1);
        var entry = new ShAnnouncementPage.Entry(seq, title, "SH", LocalDate.parse(date));
        String html = fixture("detail-" + seq + "-20261007.html");
        var snapshot = parseDetail(html, entry);
        var files = JsonMapper.builder().build().readTree(snapshot.attachments());
        assertThat(files).hasSize(count);
        for (var file : files) {
            assertThat(file.path("brdId").asString()).isEqualTo(board);
            assertThat(file.path("seq").asString()).isEqualTo(seq);
            assertThat(file.path("previewUrl").asString()).contains("brd_id=" + board + "&seq=" + seq);
        }
        assertThatThrownBy(() -> parseDetail(html.replace(board, "UNKNOWN"), entry))
                .isInstanceOf(ExternalDataRequestException.class).hasMessageContaining("식별자");
    }

    @Test
    void extractsTextFromNestedBodyTables() throws IOException {
        var page = lists.parseList(fixture("list-page1.html"), 1);
        String html = fixture("detail-311005.html");
        var snapshot = parseDetail(html, page.entries().getFirst());

        assertThat(snapshot.bodyText()).contains("민간사업자", "soco.seoul.go.kr");
    }

    @Test
    void readsActualFileSeqInsteadOfButtonIndex() throws IOException {
        var page = lists.parseList(fixture("list-page1.html"), 1);
        var entry = page.entries().stream().filter(row -> row.seq().equals("310653")).findFirst().orElseThrow();
        var snapshot = parseDetail(fixture("detail-310653.html"), entry);
        var files = JsonMapper.builder().build().readTree(snapshot.attachments());

        assertThat(files).hasSize(6);
        assertThat(files.get(4).path("fileSeq").asString()).isEqualTo("7");
        assertThat(files.get(4).path("previewUrl").asString()).endsWith("&file_seq=7");
        assertThat(snapshot.department()).isEqualTo("매입주택공급부");
    }

    @Test
    void rejectsDetailForAnotherPostAndMissingAttachmentMetadata() throws IOException {
        var page = lists.parseList(fixture("list-page1.html"), 1);
        String detail = fixture("detail-311005.html");
        assertThatThrownBy(() -> parseDetail(detail, page.entries().get(5)))
                .isInstanceOf(ExternalDataRequestException.class).hasMessageContaining("목록과 다릅니다");
        assertThatThrownBy(() -> parseDetail(detail.replace("initParam.downList", "removed"),
                page.entries().getFirst())).isInstanceOf(ExternalDataRequestException.class);
        assertThatThrownBy(() -> parseDetail(detail.replace("\"seq\":\"311005\"", "\"seq\":\"999\""),
                page.entries().getFirst())).isInstanceOf(ExternalDataRequestException.class)
                .hasMessageContaining("식별자");
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

    @Test
    void invalidDatesAreRefinementFailures() throws IOException {
        String list = fixture("list-page1.html");
        var page = lists.parseList(list, 1);
        assertThatThrownBy(() -> lists.parseList(list.replace("2026-10-02", "잘못된 날짜"), 1))
                .isInstanceOf(ExternalDataRequestException.class);
        assertThatThrownBy(() -> parseDetail(fixture("detail-311005.html")
                .replace("2026-10-02", "2026-99-99"), page.entries().getFirst()))
                .isInstanceOf(ExternalDataRequestException.class);
    }
}
