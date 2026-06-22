# Test Plan — example.com title và link

**Target URL:** https://example.com
**Created:** 2026-06-01
**Source:** mô tả tự nhiên từ user

## TC001: Verify page title chứa "Example Domain"

**Pre-condition:** Fresh browser page, không có state trước đó

**Steps:**
1. Navigate đến https://example.com
2. Đợi page load hoàn toàn

**Expected:**
- HTTP response status 200
- `<title>` của page chứa text "Example Domain"

**Success criteria:** `expect(page).toHaveTitle(/Example Domain/)`

---

## TC002: Verify link "Learn more" tồn tại và có href

**Pre-condition:** Fresh browser page

**Steps:**
1. Navigate đến https://example.com
2. Tìm element link có text "Learn more" (case-insensitive)
3. Kiểm tra element visible
4. Kiểm tra element có thuộc tính href không rỗng

**Expected:**
- Link role element với name matching `/Learn more/i` visible trên page
- `href` attribute có giá trị (không rỗng, không phải `#`)

**Success criteria:**
```
const link = page.getByRole('link', { name: /Learn more/i })
expect(link).toBeVisible()
expect(link).toHaveAttribute('href', /.+/)
```

**Note (từ smoke test trước):** example.com đã đổi text từ "More information..." sang "Learn more" — selector `/Learn more/i` là đúng.
