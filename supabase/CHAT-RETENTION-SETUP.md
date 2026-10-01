# ตั้งลบแชทอัตโนมัติเมื่ออายุเกิน 30 วัน

โค้ดนี้เตรียมพร้อมแล้ว แต่ยังไม่ทำงานจนกว่าจะติดตั้งใน Supabase ตามขั้นตอนด้านล่าง ตรวจทุกชั่วโมง ลบข้อความที่อายุเกิน 30 วันและรูปเก่าที่ไม่มีข้อความอ้างถึง เวลาเก็บจริงอาจเกิน 30 วันได้ประมาณหนึ่งชั่วโมงเมื่อระบบทำงานปกติ หากโครงการถูกพักหรืองานล้มเหลว จะต้องเปิดโครงการ/แก้ไขงานก่อนลบได้

## 1. สร้าง Edge Function

เปิดโครงการ Supabase → Edge Functions → Deploy a new function → Via Editor ตั้งชื่อ `chat-retention` วางโค้ดทั้งหมดจาก `functions/chat-retention/index.ts` แทนโค้ดตัวอย่าง แล้ว Deploy

ปิด **Verify JWT** ของฟังก์ชันนี้ โค้ดตรวจ Secret API key เองด้วย `withSupabase({ auth: 'secret' })` ผู้ใช้ทั่วไปและ publishable key เรียกงานลบไม่ได้ ไม่ต้องเพิ่ม service_role key ในหน้าเว็บ

## 2. เก็บกุญแจฝั่งเซิร์ฟเวอร์

Settings → API Keys → **Secret keys** คัดลอก key ที่ขึ้นต้น `sb_secret_` หรือสร้าง Secret key สำหรับงานนี้ จากนั้นเปิด **Vault** (อยู่ใน Integrations หรือค้นหา Vault ใน Dashboard) → Add secret

- Name: `chat_retention_api_key`
- Secret: วาง Secret key ที่คัดลอกไว้

บันทึกเฉพาะใน Supabase Vault ห้ามส่ง key นี้ในแชทหรือใส่ไฟล์เว็บไซต์ `sb_publishable_` ที่เว็บใช้ไม่สามารถใช้สำหรับงานลบได้

## 3. เปิดตารางเวลา

SQL Editor → New query → วางโค้ดจาก `chat-retention.sql` ทั้งหมด → Run หากแจ้งว่า pg_cron ยังเปิดไม่ได้ ให้ไป Integrations → Cron → Enable ก่อน แล้ว Run ใหม่ ผลลัพธ์สุดท้ายต้องมี `jobname = chat-retention-30-days`, `schedule = 0 * * * *`, `active = true`

ชื่อห้องและข้อมูลผู้ใช้จะยังเก็บไว้ งานนี้ลบเฉพาะข้อความและรูปเก่า

## ตรวจว่างานลบทำงานจริง

Cron History ยืนยันเพียงว่าส่ง HTTP request ได้ ต้องดู **Edge Functions → chat-retention → Logs** ด้วย: งานที่สำเร็จจะคืน HTTP 200 และ JSON `ok: true` พร้อมจำนวนข้อความ/รูปที่ลบ หากไม่มีข้อมูลเก่า จำนวนจะเป็น 0 ถ้า `complete: false` งานยังมีข้อมูลค้างและจะทำต่อรอบถัดไป หาก HTTP 401 ให้ตรวจ Secret key และ Verify JWT; หาก HTTP 500 ให้ตรวจ Logs

ดูผลตอบกลับ HTTP ล่าสุดจาก SQL Editor ได้ โดยไม่แสดง Secret key:

```sql
select id, status_code, timed_out, error_msg, content
from net._http_response
order by id desc
limit 10;
```

หากต้องการเรียกทดสอบหลังติดตั้งครบ ให้คัดลอกคำสั่ง `select net.http_post(...)` ใน SQL job มารันครั้งเดียว แล้วตรวจ HTTP response และ Logs คำสั่งนี้ลบข้อมูลที่เกิน 30 วันจริง

## หยุดตารางเวลา

```sql
select cron.unschedule('chat-retention-30-days');
```

ข้อมูลที่ลบแล้วไม่ได้ถูกเก็บในถังขยะ การลบรูปทำผ่าน Storage API และจะลบไฟล์จริงพร้อม metadata หากการลบรูปผิดพลาด งานรอบถัดไปจะลองใหม่ เพราะ SQL ยังอ่านพบ metadata ของไฟล์เก่าได้
