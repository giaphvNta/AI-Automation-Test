# Smoke Test — example.com

**Project:** demo
**Target URL:** https://example.com
**Created:** 2026-05-28
**Purpose:** Verify pipeline auto-pilot end-to-end

## Test scenarios

### TC001: Verify trang chủ load thành công
**Pre-condition:** None
**Steps:**
1. Navigate to https://example.com
**Expected:**
- Page title chứa "Example Domain"
- URL hợp lệ (200 OK)

### TC002: Verify h1 nội dung
**Pre-condition:** Trang chủ đã load
**Steps:**
1. Navigate to https://example.com
2. Locate element `h1`
**Expected:**
- h1 hiển thị (visible)
- h1 text chứa "Example Domain"

### TC003: Verify link "More information" tồn tại
**Pre-condition:** Trang chủ đã load
**Steps:**
1. Navigate to https://example.com
2. Find link có text chứa "More information"
**Expected:**
- Link tồn tại và visible
- Link có thuộc tính href
