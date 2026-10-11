-- Legacy rows retain identity and source URLs. Recollect to populate text and attachments.
ALTER TABLE sh_announcement_source ADD COLUMN body_text text;
ALTER TABLE sh_announcement_source ADD COLUMN attachments text
    CHECK (jsonb_typeof(attachments::jsonb) = 'array');
ALTER TABLE sh_announcement_source DROP COLUMN raw_list_html;
ALTER TABLE sh_announcement_source DROP COLUMN raw_detail_html;
