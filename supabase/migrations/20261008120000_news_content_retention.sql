-- 데이터 보관 정책: 발행일 기준 2년 지난 뉴스는 본문(content)만 비우고 제목·링크·날짜는 남긴다.
-- 매일 UTC 18:00 (한국 03:00) 실행. 운영 DB에는 2026-10-08 적용됨 (cron job id 1).
create extension if not exists pg_cron;

select cron.schedule(
  'trim-news-content-older-than-2y',
  '0 18 * * *',
  $$update public.news_articles
      set content = null
    where published_at < now() - interval '2 years'
      and content is not null$$
);
