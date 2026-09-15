Act as a Senior Frontend Developer and UI/UX Designer. I need you to build an **AI Assistant Page (Chatbot Automation Tab)** for a Vietnamese chat application. Please use React (or Vue) with Tailwind CSS for styling.

**IMPORTANT:** 
1. All UI text MUST be in Vietnamese exactly as provided below. Do not translate the UI text to English.
2. **DO NOT modify the Header.** The Header is already built and must remain untouched. Only focus on the content area below the Header.
3. The content area MUST have an **increased horizontal width** with a **24px margin on both sides**.

---

## 1. CONTENT AREA WIDTH & MARGINS (CRITICAL)

- **Header:** Keep the existing Header as-is. Do NOT redesign or modify it.
- **Content Area (Below Header):**
  - Background: Light gray (`bg-gray-50`).
  - **Horizontal Margin:** `mx-6` (24px on the left and right sides of the screen).
  - **Max Width:** **Remove or increase the max-width limit** so the content stretches wide across the screen. Use `w-full` or `max-w-[1600px]` if a limit is needed.
  - **Do NOT center with `mx-auto` if it leaves large empty side margins** — the goal is to make the content wider, using the full available width minus the 24px margins.
  - **Padding Top:** `pt-6` (24px from the header).

---

## 2. TWO-COLUMN LAYOUT INSIDE THE CONTENT AREA

- **Left Column (Settings Sidebar):**
  - Fixed width: `w-[300px]` (approx 300px).
  - White background, rounded corners (`rounded-xl`), soft shadow (`shadow-sm`).
  - `flex-shrink-0` to prevent shrinking.
- **Right Column (Main Content):**
  - Takes the remaining space: `flex-1`.
  - White background, rounded corners (`rounded-xl`), soft shadow (`shadow-sm`).
  - **Gap between columns:** `gap-6` (24px).

---

## 3. LEFT COLUMN: SETTINGS SIDEBAR (Content Only)

- Title: **"Cài đặt"** (Bold, black).
- Menu items (vertical list):
  - "Cài đặt chung" (gear icon)
  - "Thẻ hội thoại" (tag icon)
  - **"Trợ lý AI"** (sparkle icon) — **Active state:** light blue background, blue text, with a yellow "Beta" badge.
  - "Hỗ trợ trả lời" (chat bubble icon)
  - "Giao diện" (monitor icon)
  - "Cuộc gọi" (phone icon)
  - "Chế độ xoay vòng" (refresh icon)
  - "Đồng bộ" (cloud icon)
  - "Công cụ" (wrench icon)
  - "Phân quyền" (users icon)
  - "Lịch sử" (clock icon)

---

## 4. RIGHT COLUMN: MAIN CONTENT

### 4.1. Header & Tab Bar
- Large bold title: **"Trợ lý AI"**.
- A yellow "Beta" badge on the top right.
- Tab bar with two tabs:
  - **"Gợi ý trả lời"** (Inactive: gray text, white background).
  - **"Chatbot tự động"** (Active: blue background, white text, rounded).

### 4.2. Three-Column Layout (Inside Main Content)
- **Layout:** `flex gap-4` (or `gap-6`).
- **Column 1 — "Trợ lý":**
  - Width: approx `w-1/4` or `w-[220px]`.
  - Header: **"Trợ lý"** (Bold) + a "+" icon on the right.
  - List of assistants:
    - **"Trợ lý mặc định"** (Active: light blue background, blue text, robot icon).
    - **"bán hàng 1"** (Robot icon, black text).
- **Column 2 — "Cấu hình":**
  - Width: approx `w-1/3` or `flex-1`.
  - **Section "Model":** Header with chevron icon + **"Model"** (Bold). Dropdown displaying **"Gemini 2.5 Flash"**.
  - **Section "Kiến thức":** Header with chevron icon + **"Kiến thức"** (Bold) + document icon on the right.
    - Below: A file item showing **"impl.txt"** with a document icon.
    - Sub-text: **"Tài liệu giúp chatbot trả lời đúng ngữ cảnh."** (Gray text, small font).
- **Column 3 — "Khung chat":**
  - Takes the remaining space (`flex-1`).
  - Header: **"Trợ lý mặc định"** (Bold) + chevron-down icon.
  - Center: A circular blue avatar with a robot icon. Text below: **"Trợ lý mặc định"** (Bold) and **"Tư vấn khách hàng"** (Gray text).
  - Bottom: A message input field with placeholder **"Gửi tin nhắn"** and a paper plane icon (Send).

---

## 5. TECHNICAL REQUIREMENTS

- **Styling:** Use Tailwind CSS. 
  - For the content container: use `w-full mx-6` (NOT `max-w-7xl mx-auto`).
  - For the two-column layout: `flex gap-6`.
  - For the three-column layout: `flex gap-4`.
- **Do NOT touch the Header component.**
- **Icons:** Use `lucide-react` or `react-icons` for all icons.
- **State Management:** Use React `useState` for the active tab and selected assistant.
- **Responsiveness:** On screens smaller than 1024px, stack the columns vertically.

Please provide the full code for the content area of this AI Assistant Page, with the exact width and margin specifications (wider content, 24px side margins, Header untouched).