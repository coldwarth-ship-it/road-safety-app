# แชทสถานการณ์ เฝ้าภัย THAILAND

เปิด `chat.html` หรือปุ่ม **แชท** ในหน้าแผนที่ ใช้ Supabase ที่ตั้งค่าไว้ใน `chat-config.js` ไม่มี AI และไม่มีเซิร์ฟเวอร์เพิ่มเติมบน GitHub Pages

- อ่านได้โดยไม่สร้างบัญชี ตั้งชื่อก่อนส่งโดยใช้ Supabase Anonymous Sign-Ins และเก็บ session ในเบราว์เซอร์
- ห้องรวมประเทศไทยและ 77 จังหวัด โหลดครั้งละ 30 ข้อความล่าสุด พร้อม Realtime เมื่อเปิดหน้านี้
- ข้อความสูงสุด 1,500 ตัวอักษร เว้นอย่างน้อย 5 วินาทีต่อการส่ง โดยตรวจซ้ำฝั่งฐานข้อมูล
- แนบ JPG/PNG/WebP ครั้งละหนึ่งรูป ต้นฉบับไม่เกิน 8 MB ย่อเป็น JPEG ไม่เกิน 500 KB ก่อนอัปโหลดลง `chat-images` แปลงผ่าน canvas เพื่อลดข้อมูล EXIF
- ข้อความและรูปเป็นข้อมูลสาธารณะ ชื่อที่แสดงเป็นชื่อที่ผู้ใช้ตั้งเอง

## Supabase ที่ต้องมี

ตาราง `chat_rooms`, `chat_profiles`, `chat_messages` พร้อม RLS และ trigger `chat_before_send` ตาม SQL ที่ติดตั้งไว้ในโครงการ เปิด Anonymous Sign-Ins และเพิ่ม `chat_messages` ใน publication `supabase_realtime` ใช้ bucket สาธารณะ `chat-images` จำกัดไฟล์ 1 MB พร้อมนโยบายอัปโหลด/ลบเฉพาะโฟลเดอร์ของผู้ใช้

`chat-config.js` ใช้ Project URL และ publishable key ที่เปิดเผยได้ในเว็บ ห้ามใส่ secret key หรือ service_role key ในไฟล์เว็บ

## ดูแลข้อความและรูป

ใน Supabase Dashboard > Table Editor > `chat_messages` ลบข้อความที่ไม่เหมาะสม แล้วลบรูปตาม `image_path` ใน Storage > `chat-images` ด้วย หากต้องการระงับผู้ใช้ ตั้ง `banned = true` ใน `chat_profiles` สำหรับ `user_id` นั้น การระงับมีผลเฉพาะตัวตนผู้เยี่ยมชมนี้ ผู้ใช้สามารถได้ตัวตนใหม่เมื่อเปลี่ยนเครื่องหรือล้างข้อมูลเบราว์เซอร์ ชื่อและการระงับจึงไม่ใช่การยืนยันตัวบุคคล

หากมีผู้ใช้งานมาก ควรเปิด CAPTCHA สำหรับ Anonymous Sign-Ins และติดตามโควตา Auth, Storage, egress และ Realtime ใน Dashboard โครงการ Free อาจถูกพักเมื่อไม่มีการใช้งานตามเงื่อนไขของ Supabase ผู้ดูแลต้องเปิดคืนจาก Dashboard; หน้าเว็บจะแจ้งเมื่อเชื่อมต่อไม่ได้

SDK ถูกตรึงเวอร์ชันพร้อม SRI เมื่อเปลี่ยนเวอร์ชัน ให้ปรับ integrity ให้ตรงกัน ทดสอบชื่อ ข้อความ รูป และ Realtime อีกครั้ง
