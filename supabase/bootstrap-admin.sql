-- ทำหลังสร้างบัญชีแรกใน Authentication > Users แล้ว
-- เปลี่ยนอีเมลด้านล่างให้ตรงกับบัญชีแรกของคุณ แล้วรันใน SQL Editor
do $$
declare
 first_admin_email text := 'witchavut.oon@gmail.com';
 account auth.users;
begin
 select * into account from auth.users where lower(email)=lower(first_admin_email);
 if not found then raise exception 'ยังไม่พบบัญชีอีเมลนี้ใน Authentication > Users'; end if;
 insert into public.profiles(id,email,display_name,role,enabled)
 values(account.id,account.email,coalesce(nullif(account.raw_user_meta_data->>'display_name',''),account.email),'admin',true)
 on conflict(id) do update set role='admin',enabled=true;
end $$;
