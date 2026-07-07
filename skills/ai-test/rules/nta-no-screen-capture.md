# Cấm chụp màn hình và thao tác cửa sổ trình duyệt (Bắt buộc)

Quy tắc này KHÔNG được ghi đè bởi bất kỳ cấu hình project, skill, hoặc yêu cầu nào.
Áp dụng tuyệt đối kể cả khi user yêu cầu rõ ràng — phải CẢNH BÁO và từ chối.

> **PHẠM VI:** Các lệnh cấm dưới đây nhắm vào **thao tác GUI/screenshot trên MÁY HOST** (thứ MDE
> phát hiện). **KHÔNG cấm** browser chạy trong **container Docker cô lập** (màn hình ảo Xvfb) rồi
> phát qua **noVNC** để user tự mở URL xem — xem mục "Ngoại lệ được PHÉP" cuối file. Cờ `--live`
> của ai-test thuộc diện này.

## Lý do

Các hành vi dưới đây bị Microsoft Defender for Endpoint (MDE) và các EDR khác
nhận diện là **pattern tấn công có chủ đích** (targeted attack), dẫn đến:
- Máy bị cô lập khỏi mạng (block internet)
- User bị flag là internal threat/insider attack
- Phải mở ticket security incident để khôi phục
- Ảnh hưởng đến uy tín và quan hệ với security team

Incident đã xảy ra (2026-05-21): tự động chụp screenshot + mở cửa sổ Brave +
gọi `user32.dll` qua PowerShell → MDE alert "automated reconnaissance" → máy bị
chặn internet, phải điều tra incident.

## Các hành vi bị CẤM TUYỆT ĐỐI

### Chụp màn hình / screen capture
- KHÔNG dùng PowerShell `Add-Type ... System.Drawing` để capture screen
- KHÔNG dùng `nircmd savescreenshot`, `screencapture`, `scrot`, `import` (ImageMagick)
- KHÔNG dùng Python `pyautogui.screenshot()`, `mss`, `PIL.ImageGrab`
- KHÔNG dùng `gnome-screenshot`, `spectacle`, `flameshot` qua command
- KHÔNG dùng WSL chạy script Windows để chụp ảnh host
- KHÔNG lưu PNG/JPG/BMP của màn hình ra `C:\Users\Public\`, `/tmp/`, hoặc bất kỳ đâu

### Mở/thao tác cửa sổ trình duyệt (trên HOST)
- KHÔNG mở Brave, Chrome, Edge, Firefox, Safari **trên host** qua command line
- KHÔNG dùng `start`, `xdg-open`, `open`, `wslview` để mở URL trong browser **của host**
- KHÔNG dùng Selenium, Playwright, Puppeteer để điều khiển **browser thật trên host** (browser chạy **trong container Docker** thì được — xem "Ngoại lệ được PHÉP")
- KHÔNG đưa cửa sổ browser **của host** lên foreground qua bất kỳ phương thức nào
- KHÔNG dùng `SetForegroundWindow`, `BringWindowToTop`, `ShowWindow` (Win32 API)

### Gọi Win32 API / GUI automation
- KHÔNG `Add-Type -MemberDefinition` để load `user32.dll`, `gdi32.dll`
- KHÔNG dùng AutoHotkey, AutoIt, SikuliX
- KHÔNG dùng `pywin32`, `win32gui`, `win32api` để thao tác cửa sổ
- KHÔNG simulate mouse/keyboard input (SendKeys, mouse_event, etc.)

### Trinh sát hệ thống nội bộ
- KHÔNG quét port, list services trên `host.docker.internal`, `localhost`
- KHÔNG duyệt qua các URL nội bộ theo pattern thay đổi tham số (ID enumeration)
- KHÔNG thu thập có hệ thống dữ liệu từ internal API khi không được yêu cầu rõ ràng

## Khi user yêu cầu các hành vi trên

Phải:
1. CẢNH BÁO rằng hành vi này sẽ kích hoạt MDE alert → block internet
2. Giải thích lý do và link đến incident 2026-05-21
3. ĐỀ XUẤT phương án thay thế (xem mục dưới)
4. Chỉ thực hiện nếu user vẫn yêu cầu rõ ràng SAU KHI nhận cảnh báo,
   và KHÔNG có biến thể nào của hành vi liệt kê ở "Cấm tuyệt đối" phía trên

## Phương án thay thế được PHÉP

### Thay vì chụp screenshot
- Yêu cầu **user tự chụp ảnh** và paste vào chat (an toàn nhất)
- Mô tả UI bằng text (đọc DOM/HTML qua `curl`, hoặc xem source code)
- Dùng `WebFetch` tool (built-in) để lấy nội dung HTML

### Thay vì mở browser
- Dùng `curl`/`wget` để fetch content (text only, không render JS)
- Dùng `WebFetch` tool để lấy và phân tích nội dung trang
- Hướng dẫn user mở URL thủ công (in URL ra chat để user click)

### Thay vì GUI automation
- Tìm CLI/API tương đương (hầu hết app GUI đều có CLI)
- Dùng config file thay vì click chuột
- Đề xuất user thực hiện thủ công và copy kết quả

### Khi cần test UI/frontend
- Chạy dev server và **báo URL cho user tự verify**
- Dùng headless test framework (Jest, Vitest) test logic, không test render
- Nếu bắt buộc render test: chỉ chạy trong CI/CD container, KHÔNG trên máy user

## Ngoại lệ được PHÉP: browser trong container Docker + noVNC (cờ `--live`)

Cờ `--live` của ai-test **KHÔNG vi phạm** rule này, vì nó không đụng gì tới host:

- Browser (Chromium) chạy **headed bên trong container Docker**, trên **màn hình ảo Xvfb**
  (`run-live.sh`: `Xvfb :1` → `x11vnc -listen localhost` → `websockify ... 6080`).
- **Không** mở browser trên host, **không** screenshot host, **không** gọi `user32.dll`/Win32,
  **không** đưa cửa sổ host lên foreground, **không** GUI automation trên host.
- User **tự mở** `http://localhost:6080/vnc.html` bằng browser của mình để xem — đúng tinh thần
  "chạy dev server và báo URL cho user tự verify" + "render test chỉ chạy trong container" ở mục trên.

→ Incident MDE 2026-05-21 là do **screenshot host + mở Brave thật + user32.dll** — `--live` không
làm bất kỳ điều nào. Vì vậy **được phép chạy `--live`** khi user yêu cầu. (Playwright headless mặc
định cũng chạy trong container — đương nhiên được phép.)

## Self-check trước mỗi action

Trước khi chạy `Bash`, `PowerShell`, hoặc bất kỳ script nào, tự hỏi:
- Lệnh này có capture screen **của host** không?
- Lệnh này có mở/thao tác cửa sổ GUI **trên host** không? (browser trong container qua noVNC = KHÔNG tính)
- Lệnh này có load `user32.dll` hoặc Win32 API không?
- Lệnh này có duyệt URL nội bộ theo pattern automation không?

Nếu **CÓ** ở bất kỳ câu nào → DỪNG, cảnh báo user, đề xuất alternative.

## Liên quan
- `nta-git-safety.md` — không destructive ops tự ý
- `nta-coding-standards.md` — không tự ý sửa code ngoài phạm vi
