-- 프로필 사진: 서버 저장소에 올려 새로고침·다른 기기에서도 유지 (승덕 2026-10-22)
-- 경로 '내 id/사진 id.jpg'. 로그인한 사람은 모두 볼 수 있고, 올리기·지우기는 자기 폴더만.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('profile-photos', 'profile-photos', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    execute $p$create policy profile_photos_read on storage.objects for select to authenticated
      using (bucket_id = 'profile-photos')$p$;
    execute $p$create policy profile_photos_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy profile_photos_delete on storage.objects for delete to authenticated
      using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;
