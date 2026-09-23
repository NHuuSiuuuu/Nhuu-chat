Yêu cầu xây dựng Component Đồ họa AI có Animation (Animated AI Feature Graphic):

Hãy đóng vai trò là một Frontend Developer. Tôi cần bạn xây dựng một component đồ họa trực quan (Visual Component) giống hệt thiết kế đính kèm. Khối này dùng để minh họa cho tính năng "AI Chatbot" trên Landing Page.

Vui lòng sử dụng React, Tailwind CSS, icon từ lucide-react (dùng icon BrainCircuit hoặc Bot) và đặc biệt dùng Framer Motion để làm hiệu ứng chuyển động mượt mà.

1. Cấu trúc Tổng thể (Container):

Một thẻ div cha có thuộc tính relative, flex items-center justify-center, chiều rộng và chiều cao cố định (ví dụ w-[400px] h-[400px]).

2. Nền trang trí (Dashed Diamond Background):

Một khung hình vuông mờ nằm dưới cùng, kích thước lớn (VD: w-[320px] h-[320px]), không có màu nền.

Viền nét đứt màu xanh nhạt: border-2 border-dashed border-blue-200/60 rounded-3xl.

Animation (Framer Motion): Đặt góc xoay mặc định là 45 độ (rotate-45 thành hình thoi). Cho nó hiệu ứng xoay tròn chậm rãi, liên tục vô hạn (Rotate từ 45 độ lên 405 độ, duration: 20, repeat: Infinity, ease: "linear").

3. Khối Trung tâm (Main Centerpiece):

Một thẻ <motion.div> màu trắng, hình vuông bo góc lớn (w-[260px] h-[260px] bg-white rounded-[2rem] shadow-xl), đặt căn giữa tuyệt đối (absolute inset-0 m-auto).

Bên trong thẻ trắng này là một vòng tròn màu xanh dương rực rỡ (bg-[#0090FF] w-[200px] h-[200px] rounded-full), cũng căn giữa hoàn toàn.

Giữa vòng tròn xanh là Icon AI (BrainCircuit hoặc Bot) màu trắng, nét dày, kích thước to (w-16 h-16 text-white).

Animation: Cho toàn bộ khối trắng này lơ lửng lên xuống nhẹ nhàng theo trục Y (Dùng Framer Motion: animate={{ y: [-8, 8, -8] }}, transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}).

4. Các thẻ Badge trôi nổi (Floating Badges):
Đặt các thẻ này nằm ngoài khối trung tâm bằng absolute, đè lên trên (z-10).

Badge 1: Trạng thái trả lời (Góc trên bên phải):

Vị trí: Bám vào góc trên bên phải của khối trung tâm (-right-12 top-8).

UI: Nền trắng, hình viên thuốc (rounded-full), đổ bóng (shadow-lg), padding vừa phải.

Nội dung: Flexbox chứa 1 chấm tròn màu xanh lá (w-2.5 h-2.5 bg-green-500 rounded-full) và text "Đang trả lời 12 khách hàng..." (text-sm font-medium text-slate-700).

Animation 1: Chấm xanh lá phải có hiệu ứng nhấp nháy (Thêm class animate-ping của Tailwind vào một thẻ span bọc quanh chấm xanh, kết hợp một chấm xanh tĩnh đè lên).

Animation 2: Nguyên cả khối badge lơ lửng lên xuống (y: [-4, 4, -4]) nhưng có delay: 1s để nhịp lơ lửng khác với khối trung tâm.

Badge 2: Trích dẫn tin nhắn (Góc dưới bên trái):

Vị trí: Bám vào góc dưới bên trái (-left-16 bottom-8).

UI: Nền trắng, bo góc (rounded-2xl), đổ bóng lớn (shadow-2xl), padding p-4, chiều rộng khoảng w-[220px].

Nội dung dòng 1: Text mô phỏng câu hỏi khách hàng: "Sản phẩm này có hỗ trợ trả góp không shop?" (text-sm text-slate-600 mb-2).

Nội dung dòng 2: Flexbox chứa icon Check Circle (nhỏ, màu xanh blue) và text in hoa "ĐÃ TỰ ĐỘNG TRẢ LỜI" (text-[10px] font-bold text-[#0090FF]).

Animation: Cũng cho khối này lơ lửng (y: [-6, 6, -6]) với delay: 2s để tạo cảm giác chuyển động ngẫu nhiên, tự nhiên.