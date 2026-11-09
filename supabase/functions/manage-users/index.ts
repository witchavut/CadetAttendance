import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// verify_jwt=false is safe here because every non-OPTIONS request explicitly
// validates the bearer token with Auth, then checks the database role.
Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
  const cors: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (allowed.includes(origin)) cors['Access-Control-Allow-Origin'] = origin;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (!origin || !allowed.includes(origin)) return json({ error: 'Origin ไม่ได้รับอนุญาต กรุณาตั้งค่า ALLOWED_ORIGINS' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await service.auth.getUser(authorization.slice(7));
  if (authError || !user) return json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, 401);
  const { data: profile, error: profileError } = await service.from('profiles').select('role,enabled').eq('id', user.id).single();
  if (profileError || !profile?.enabled || profile.role !== 'admin') return json({ error: 'เฉพาะผู้ดูแลระบบ' }, 403);
  try {
    if (Number(request.headers.get('Content-Length') || 0) > 10000) return json({ error: 'ข้อมูลยาวเกินไป' }, 413);
    const input = await request.json();
    const name = String(input.display_name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const role = String(input.role || '');
    const password = String(input.password || '');
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !['admin', 'teacher', 'viewer'].includes(role) || password.length < 12 || password.length > 128 || typeof input.enabled !== 'boolean') {
      return json({ error: 'ตรวจชื่อ อีเมล สิทธิ์ และรหัสผ่านอย่างน้อย 12 ตัวอักษร' }, 400);
    }
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
    if (error || !data.user) return json({ error: error?.message || 'สร้างบัญชีไม่สำเร็จ' }, 400);
    // Use the caller's token for authorization and audit attribution.
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { error: memberError } = await caller.rpc('set_member', { p_id: data.user.id, p_role: role, p_name: name, p_enabled: input.enabled });
    if (memberError) {
      const { error: rollbackError } = await service.auth.admin.deleteUser(data.user.id);
      return json({ error: rollbackError ? 'สร้างบัญชีแล้วแต่กำหนดสิทธิ์ไม่สำเร็จ บัญชียังปิดสิทธิ์อยู่ ให้ผู้ดูแลตรวจสอบใน Authentication' : memberError.message }, 500);
    }
    return json({ id: data.user.id, email });
  } catch {
    return json({ error: 'รูปแบบคำขอไม่ถูกต้อง' }, 400);
  }
});
