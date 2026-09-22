import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { AuthRole } from "../../state/auth.store.js";

export interface LandingPageProps {
  user: { email: string; role: AuthRole } | null;
  onDashboard: () => void;
  onLogin: () => void;
  onRegister: () => void;
}

type IconName = "arrow" | "check" | "chevron" | "facebook" | "globe" | "layers" | "message" | "send" | "sparkle" | "telegram" | "users" | "zalo";

const iconPaths: Record<IconName, React.ReactNode> = {
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  facebook: <path d="M14 8h3V5h-3a4 4 0 0 0-4 4v2H7v3h3v5h3v-5h3l1-3h-4V9a1 1 0 0 1 1-1Z" />,
  globe: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2 2.2 3 4.8 3 8s-1 5.8-3 8c-2-2.2-3-4.8-3-8s1-5.8 3-8Z" /></>,
  layers: <><path d="m12 4 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" /></>,
  message: <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8 8 0 0 1-3-.6L4 20l1.7-4.5A7.3 7.3 0 0 1 4.5 11 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z" />,
  send: <path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" />,
  sparkle: <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Zm6 12 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z" />,
  telegram: <path d="m21 4-3 16-6-5-3 3v-5L21 4ZM9 13l8-6" />,
  users: <><circle cx="9" cy="9" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 7a3 3 0 0 1 0 6m1 1a5 5 0 0 1 4 6" /></>,
  zalo: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 16 16 8M10 8h6v6" /></>,
};

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>;
}

function FadeUp({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, y: 24 }}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: reducedMotion ? 0 : 0.55, delay: reducedMotion ? 0 : delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

const channels: { name: string; icon: IconName; color: string }[] = [
  { name: "Facebook", icon: "facebook", color: "text-blue-600" },
  { name: "Zalo", icon: "zalo", color: "text-sky-500" },
  { name: "Telegram", icon: "telegram", color: "text-cyan-500" },
  { name: "Website", icon: "globe", color: "text-violet-500" },
];

const features = [
  { icon: "layers" as IconName, title: "Hộp thư hợp nhất", text: "Tập trung mọi cuộc trò chuyện trong một không gian rõ ràng, không bỏ sót khách hàng." },
  { icon: "sparkle" as IconName, title: "Trợ lý AI thông minh", text: "AI hiểu ngữ cảnh, khai thác kiến thức riêng và gợi ý câu trả lời phù hợp." },
  { icon: "send" as IconName, title: "Đăng bài đa kênh", text: "Soạn, lên lịch và theo dõi nội dung Facebook Page từ một màn hình duy nhất." },
  { icon: "users" as IconName, title: "Quản lý khách hàng", text: "Gắn nhãn, phân công và theo dõi trạng thái chăm sóc theo từng hội thoại." },
];

const faqs = [
  { question: "NhuuChat hỗ trợ những kênh nào?", answer: "NhuuChat hỗ trợ Facebook, Zalo, Telegram và Website trong một hệ thống quản lý tập trung." },
  { question: "Tôi có thể dùng thử trước khi đăng ký không?", answer: "Có. Anh có thể bắt đầu với gói miễn phí để khám phá các tính năng cốt lõi trước khi nâng cấp." },
  { question: "AI có sử dụng dữ liệu của doanh nghiệp không?", answer: "Kiến thức của từng trợ lý được cô lập theo tài khoản và chỉ phục vụ cho các cuộc hội thoại của anh." },
  { question: "Có thể kết nối nhiều tài khoản cùng lúc không?", answer: "Có. Anh có thể kết nối nhiều tài khoản ở các kênh khác nhau và theo dõi riêng từng ngữ cảnh." },
];

function Brand() {
  return <a href="#top" className="flex items-center gap-2 text-slate-950" aria-label="NhuuChat - về đầu trang"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-extrabold text-white shadow-lg shadow-blue-600/20">NH</span><span className="text-lg font-extrabold tracking-tight">NhuuChat</span></a>;
}

function InboxMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl shadow-blue-900/10">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /><span className="text-xs font-semibold text-slate-600">NhuuChat Inbox</span></div><span className="text-[10px] text-slate-400">Trực tuyến</span></div>
      <div className="grid min-h-[280px] grid-cols-[38%_62%] sm:min-h-[340px]">
        <div className="border-r border-slate-100 bg-slate-50/70 p-3"><div className="mb-3 h-7 rounded-lg bg-white shadow-sm" />{["Chị Lan Anh", "Minh Store", "Nguyễn Hoàng", "Tâm Boutique"].map((name, index) => <div key={name} className={`mb-2 flex items-center gap-2 rounded-lg p-2 ${index === 0 ? "bg-blue-100/70" : ""}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${["bg-rose-400", "bg-amber-400", "bg-violet-400", "bg-emerald-400"][index]}`}>{name.charAt(0)}</span><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-slate-700">{name}</p><p className="truncate text-[9px] text-slate-400">Tin nhắn mới nhất...</p></div></div>)}</div>
        <div className="flex flex-col bg-white p-4"><div className="flex items-center gap-2 border-b border-slate-100 pb-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-400 text-xs font-bold text-white">L</span><div><p className="text-xs font-bold text-slate-700">Chị Lan Anh</p><p className="text-[9px] text-emerald-500">Đang hoạt động</p></div></div><div className="flex-1 space-y-3 py-4"><div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-[10px] text-slate-600">Shop mình còn mẫu này không ạ?</div><div className="ml-auto max-w-[75%] rounded-2xl rounded-tr-sm bg-blue-600 px-3 py-2 text-[10px] text-white">Dạ còn chị nhé, em gửi thông tin ngay ạ.</div><div className="flex items-center gap-1 text-[9px] text-violet-500"><Icon name="sparkle" className="h-3 w-3" /> AI đã gợi ý câu trả lời</div></div><div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><span className="flex-1 text-[10px] text-slate-300">Nhập tin nhắn...</span><span className="text-blue-600"><Icon name="send" className="h-4 w-4" /></span></div></div>
      </div>
    </div>
  );
}

function ChannelBadge({ channel }: { channel: typeof channels[number] }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"><span className={channel.color}><Icon name={channel.icon} className="h-6 w-6" /></span><span className="text-sm font-semibold text-slate-700">{channel.name}</span></div>;
}

function PricingCard({ name, price, description, featured, items }: { name: string; price: string; description: string; featured?: boolean; items: string[] }) {
  return <div className={`relative rounded-3xl border p-6 text-left ${featured ? "border-blue-600 bg-blue-600 text-white shadow-xl shadow-blue-600/20" : "border-slate-200 bg-white text-slate-900"}`}>{featured && <span className="absolute -top-3 right-6 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950">Phổ biến nhất</span>}<h3 className="text-lg font-bold">{name}</h3><p className={`mt-2 text-sm ${featured ? "text-blue-100" : "text-slate-500"}`}>{description}</p><p className="mt-6 text-3xl font-extrabold">{price}<span className={`text-sm font-medium ${featured ? "text-blue-100" : "text-slate-400"}`}>{price !== "Miễn phí" && " / tháng"}</span></p><button type="button" className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold transition ${featured ? "bg-white text-blue-700 hover:bg-blue-50" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>Bắt đầu ngay</button><ul className={`mt-6 space-y-3 text-sm ${featured ? "text-blue-50" : "text-slate-600"}`}>{items.map(item => <li key={item} className="flex gap-2"><Icon name="check" className="h-4 w-4 shrink-0" />{item}</li>)}</ul></div>;
}

export function LandingPage({ user, onDashboard, onLogin, onRegister }: LandingPageProps) {
  const [openFaq, setOpenFaq] = React.useState<number | null>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const landingLinks = [
    ["Tính năng", "#tinh-nang"],
    ["Kênh tích hợp", "#kenh-tich-hop"],
    ["Bảng giá", "#bang-gia"],
    ["FAQ", "#faq"],
  ] as const;

  return (
    <div id="top" className="min-h-screen overflow-x-hidden bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-100/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-500 md:flex" aria-label="Điều hướng chính">
            {landingLinks.map(([label, href]) => <a key={href} className="transition hover:text-blue-600" href={href}>{label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={mobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
              aria-controls="mobile-navigation"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(open => !open)}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 md:hidden"
            >
              <span className="sr-only">Menu</span>
              <span className="block h-0.5 w-5 bg-current" />
              <span className="mt-1 block h-0.5 w-5 bg-current" />
              <span className="mt-1 block h-0.5 w-5 bg-current" />
            </button>
            {user ? <button type="button" onClick={onDashboard} aria-label={`Mở Dashboard cho ${user.email}`} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{user.email.charAt(0).toUpperCase()}</span><span className="hidden max-w-[140px] truncate sm:block">{user.email}</span></button> : <><button type="button" aria-label="Đăng nhập" onClick={onLogin} className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:block">Đăng nhập</button><button type="button" aria-label="Đăng ký" onClick={onRegister} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">Đăng ký</button></>}</div>
        </div>
        {mobileMenuOpen && <nav id="mobile-navigation" aria-label="Điều hướng trên thiết bị di động" className="border-t border-slate-100 px-5 py-3 md:hidden"><div className="mx-auto flex max-w-7xl flex-col gap-1">{landingLinks.map(([label, href]) => <a key={href} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-600" href={href} onClick={() => setMobileMenuOpen(false)}>{label}</a>)}</div></nav>}
      </header>

      <main>
        <section className="relative overflow-hidden bg-slate-50 px-5 pb-16 pt-20 lg:px-8 lg:pb-24 lg:pt-28"><div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-blue-100/60 blur-3xl" /><div className="relative mx-auto max-w-7xl"><FadeUp className="mx-auto max-w-3xl text-center"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"><Icon name="sparkle" className="h-3.5 w-3.5" /> Nền tảng chăm sóc khách hàng hiện đại</span><h1 className="mt-6 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">Quản lý tin nhắn đa kênh <span className="text-blue-600">&amp; AI Chatbot</span> tự động</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-500 sm:text-lg">Kết nối mọi kênh trò chuyện, chăm sóc khách hàng và tự động hóa công việc trong một nền tảng duy nhất.</p><form className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row" onSubmit={event => event.preventDefault()}><label className="sr-only" htmlFor="landing-email">Email của bạn</label><input id="landing-email" type="email" placeholder="Nhập email của bạn" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-blue-500 transition focus:ring-2" /><button type="submit" onClick={onRegister} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">Bắt đầu dùng thử</button></form></FadeUp><FadeUp className="mx-auto mt-16 max-w-5xl" delay={0.12}><InboxMockup /></FadeUp></div></section>

        <FadeUp><section id="kenh-tich-hop" className="scroll-mt-24 border-b border-slate-100 px-5 py-14 lg:px-8"><div className="mx-auto max-w-7xl text-center"><p className="text-sm font-semibold text-slate-400">Kết nối liền mạch với các kênh anh đang sử dụng</p><div className="mx-auto mt-7 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">{channels.map(channel => <ChannelBadge key={channel.name} channel={channel} />)}</div></div></section></FadeUp>

        <section id="tinh-nang" className="scroll-mt-24 px-5 py-20 lg:px-8"><div className="mx-auto max-w-7xl"><FadeUp className="max-w-2xl"><span className="text-sm font-bold text-blue-600">MỌI THỨ TRONG TẦM TAY</span><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Một nền tảng, trọn quy trình chăm sóc khách hàng</h2><p className="mt-4 leading-7 text-slate-500">NhuuChat giúp đội ngũ làm việc nhanh hơn, phản hồi nhất quán hơn và không để cơ hội nào trôi qua.</p></FadeUp><div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{features.map((feature, index) => <FadeUp key={feature.title} delay={index * 0.06}><article className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon name={feature.icon} /></span><h3 className="mt-5 font-bold text-slate-800">{feature.title}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{feature.text}</p></article></FadeUp>)}</div></div></section>

        <section className="bg-slate-50 px-5 py-20 lg:px-8"><div className="mx-auto max-w-7xl"><FadeUp className="text-center"><span className="text-sm font-bold text-blue-600">BẮT ĐẦU TRONG VÀI PHÚT</span><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Đơn giản để kết nối, mạnh mẽ để phát triển</h2></FadeUp><div className="mt-12 grid gap-8 md:grid-cols-3">{[{ title: "Kết nối kênh", text: "Thêm các tài khoản Facebook, Zalo, Telegram hoặc Website của anh." }, { title: "Quản lý tập trung", text: "Theo dõi hội thoại, phân công và chăm sóc khách hàng trên Inbox." }, { title: "Tự động hóa", text: "Bật trợ lý AI để phản hồi nhanh, đúng ngữ cảnh cả ngày lẫn đêm." }].map((step, index) => <FadeUp key={step.title} delay={index * 0.08} className="relative text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-lg font-black text-white shadow-lg shadow-blue-600/20">{index + 1}</span><h3 className="mt-5 font-bold">{step.title}</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">{step.text}</p></FadeUp>)}</div></div></section>

        <section className="px-5 py-20 lg:px-8"><div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2"><FadeUp><div className="rounded-3xl bg-blue-600 p-6 text-white shadow-xl shadow-blue-600/20 sm:p-10"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><Icon name="sparkle" /></span><span className="font-bold">Trợ lý AI NhuuChat</span></div><div className="mt-8 space-y-4"><div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/15 px-4 py-3 text-sm">Khách đang quan tâm sản phẩm nào vậy?</div><div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-white px-4 py-3 text-sm text-slate-700">Em đang quan tâm mẫu áo mới. Cho em xin giá và thông tin giao hàng nhé.</div><div className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-slate-700"><span className="mt-0.5 text-blue-600"><Icon name="sparkle" className="h-4 w-4" /></span><span>AI gợi ý: "Dạ, mẫu này đang có giá ưu đãi và hỗ trợ giao hàng toàn quốc ạ."</span></div></div></div></FadeUp><FadeUp delay={0.1}><span className="text-sm font-bold text-blue-600">AI ĐỒNG HÀNH CÙNG ĐỘI NGŨ</span><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Phản hồi nhanh hơn, tự nhiên hơn</h2><p className="mt-5 leading-7 text-slate-500">Huấn luyện trợ lý theo kiến thức và phong cách riêng của doanh nghiệp. Nhân viên luôn có thể xem, chỉnh sửa và tiếp quản khi cần.</p><ul className="mt-7 space-y-4 text-sm font-medium text-slate-700"><li className="flex items-center gap-3"><span className="text-emerald-500"><Icon name="check" /></span> Hiểu ngữ cảnh cuộc trò chuyện</li><li className="flex items-center gap-3"><span className="text-emerald-500"><Icon name="check" /></span> Gợi ý câu trả lời cho nhân viên</li><li className="flex items-center gap-3"><span className="text-emerald-500"><Icon name="check" /></span> Kiến thức tách biệt và an toàn</li></ul></FadeUp></div></section>

        <section id="bang-gia" className="scroll-mt-24 bg-slate-50 px-5 py-20 lg:px-8"><div className="mx-auto max-w-7xl"><FadeUp className="text-center"><span className="text-sm font-bold text-blue-600">BẢNG GIÁ MINH BẠCH</span><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Chọn gói phù hợp với anh</h2><p className="mx-auto mt-4 max-w-xl text-slate-500">Bắt đầu miễn phí, nâng cấp khi doanh nghiệp của anh sẵn sàng.</p></FadeUp><div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-3"><FadeUp><PricingCard name="Khởi đầu" price="Miễn phí" description="Khám phá các tính năng cơ bản" items={["1 kênh kết nối", "100 hội thoại mỗi tháng", "Inbox hợp nhất"]} /></FadeUp><FadeUp delay={0.08}><PricingCard name="Tăng trưởng" price="199K" description="Dành cho đội ngũ đang phát triển" featured items={["5 kênh kết nối", "Không giới hạn hội thoại", "Trợ lý AI cơ bản"]} /></FadeUp><FadeUp delay={0.16}><PricingCard name="Chuyên nghiệp" price="499K" description="Tối ưu cho doanh nghiệp" items={["Không giới hạn kênh", "AI theo kiến thức riêng", "Phân quyền đội ngũ"]} /></FadeUp></div></div></section>

        <section className="px-5 py-20 lg:px-8"><div className="mx-auto max-w-5xl text-center"><FadeUp><span className="text-4xl text-blue-600">“</span><blockquote className="mx-auto max-w-3xl text-2xl font-bold leading-relaxed text-slate-800 sm:text-3xl">NhuuChat giúp đội ngũ của chúng tôi không còn bỏ sót tin nhắn và tiết kiệm rất nhiều thời gian mỗi ngày.</blockquote><p className="mt-6 text-sm font-semibold text-slate-500">Minh Anh · Chủ cửa hàng thời trang</p></FadeUp><div className="mt-12 grid grid-cols-2 gap-6 border-t border-slate-100 pt-10 sm:grid-cols-4"><div><p className="text-3xl font-black text-blue-600">4+</p><p className="mt-1 text-xs text-slate-500">Kênh tích hợp</p></div><div><p className="text-3xl font-black text-blue-600">24/7</p><p className="mt-1 text-xs text-slate-500">Hỗ trợ tự động</p></div><div><p className="text-3xl font-black text-blue-600">3x</p><p className="mt-1 text-xs text-slate-500">Nhanh hơn</p></div><div><p className="text-3xl font-black text-blue-600">99%</p><p className="mt-1 text-xs text-slate-500">Không bỏ sót tin</p></div></div></div></section>

        <section id="faq" className="scroll-mt-24 bg-slate-50 px-5 py-20 lg:px-8"><div className="mx-auto max-w-3xl"><FadeUp className="text-center"><span className="text-sm font-bold text-blue-600">GIẢI ĐÁP</span><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Câu hỏi thường gặp</h2></FadeUp><div className="mt-10 space-y-3">{faqs.map((faq, index) => <FadeUp key={faq.question} delay={index * 0.04}><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><button type="button" className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-slate-800" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? null : index)}><span>{faq.question}</span><Icon name="chevron" className={`h-5 w-5 shrink-0 text-slate-400 transition ${openFaq === index ? "rotate-180" : ""}`} /></button>{openFaq === index && <p className="px-5 pb-5 text-sm leading-6 text-slate-500">{faq.answer}</p>}</div></FadeUp>)}</div></div></section>

        <section className="px-5 py-20 lg:px-8"><FadeUp className="mx-auto max-w-5xl rounded-3xl bg-blue-600 px-6 py-12 text-center text-white shadow-xl shadow-blue-600/20 sm:px-12"><h2 className="text-3xl font-black tracking-tight sm:text-4xl">Sẵn sàng chăm sóc khách hàng tốt hơn?</h2><p className="mx-auto mt-4 max-w-xl text-blue-100">Bắt đầu hành trình quản lý tin nhắn thông minh cùng NhuuChat hôm nay.</p><button type="button" onClick={onRegister} className="mt-7 rounded-xl bg-white px-6 py-3 font-bold text-blue-700 transition hover:bg-blue-50">Bắt đầu miễn phí <Icon name="arrow" className="ml-2 inline-block h-4 w-4" /></button></FadeUp></section>
      </main>
      <footer className="border-t border-slate-100 px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row"><Brand /><p className="text-xs text-slate-400">© 2026 NhuuChat. Quản lý tin nhắn dễ dàng hơn.</p><div className="flex gap-5 text-xs text-slate-400"><a href="#tinh-nang" className="hover:text-blue-600">Tính năng</a><a href="#faq" className="hover:text-blue-600">Trợ giúp</a></div></div></footer>
    </div>
  );
}
