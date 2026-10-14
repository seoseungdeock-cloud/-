// 첫 관리자어드민 계정을 만듭니다 (한 번만). 비밀값은 환경 변수로만 받습니다.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIRST_ADMIN_ID, FIRST_ADMIN_PASSWORD, FIRST_ADMIN_NAME
// 사용: node scripts/supabase-first-admin.mjs
import { createClient } from '@supabase/supabase-js';

const need = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FIRST_ADMIN_ID', 'FIRST_ADMIN_PASSWORD'];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`환경 변수가 없습니다: ${missing.join(', ')}`);
  process.exit(1);
}
const loginId = process.env.FIRST_ADMIN_ID.trim().toLowerCase();
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('super_admin', true);
if (count) {
  console.log('관리자어드민이 이미 있습니다. 새 계정은 앱의 백오피스에서 만드세요.');
  process.exit(0);
}
const { data, error } = await admin.auth.admin.createUser({
  email: `${loginId}@rightnow.local`,
  password: process.env.FIRST_ADMIN_PASSWORD,
  email_confirm: true,
});
if (error) {
  console.error(`계정을 만들지 못했습니다: ${error.message}`);
  process.exit(1);
}
const { error: pe } = await admin.from('profiles').insert({
  id: data.user.id,
  login_id: loginId,
  nickname: process.env.FIRST_ADMIN_NAME ?? '관리자',
  role: 'admin',
  super_admin: true,
});
if (pe) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error(`프로필을 만들지 못했습니다: ${pe.message}`);
  process.exit(1);
}
console.log(`관리자어드민 '${loginId}' 계정을 만들었습니다.`);
