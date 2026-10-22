-- 경영위원회를 대화방에 연결 + 카테고리별 누적 분석 (승덕 2026-10-22)
alter table public.ax_councils add column if not exists room_id text;
alter table public.ax_councils add column if not exists rounds jsonb not null default '[]';
create index if not exists ax_councils_room on public.ax_councils (room_id);
