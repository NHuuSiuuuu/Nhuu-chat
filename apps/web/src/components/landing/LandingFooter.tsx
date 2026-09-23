import * as React from "react";

function Brand() {
  return <a href="#top" className="flex items-center text-slate-950" aria-label="NhuuChat - về đầu trang"><img className="h-8 w-[128px] object-contain" src="/nhuu-logo-landing.svg" alt="NhuuChat" /></a>;
}

export function LandingFooter() {
  return <footer className="border-t border-slate-100 px-5 py-12 lg:px-8"><div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-5"><div className="lg:col-span-2"><Brand /><p className="mt-4 max-w-xs text-base leading-7 text-slate-500">Nền tảng quản lý tin nhắn đa kênh và AI Chatbot cho doanh nghiệp hiện đại.</p></div><div><h3 className="text-xs font-semibold text-slate-800">Sản phẩm</h3><div className="mt-4 space-y-3 text-xs text-slate-500"><a className="block hover:text-blue-600" href="#tinh-nang">Tính năng</a><a className="block hover:text-blue-600" href="#bang-gia">Bảng giá</a></div></div><div><h3 className="text-xs font-semibold text-slate-800">Hỗ trợ</h3><div className="mt-4 space-y-3 text-xs text-slate-500"><a className="block hover:text-blue-600" href="#faq">Câu hỏi thường gặp</a><a className="block hover:text-blue-600" href="#top">Liên hệ</a></div></div><div><h3 className="text-xs font-semibold text-slate-800">Chính sách</h3><div className="mt-4 space-y-3 text-xs text-slate-500"><a className="block hover:text-blue-600" href="#top">Bảo mật</a><a className="block hover:text-blue-600" href="#top">Điều khoản</a></div></div></div><div className="mx-auto mt-10 max-w-6xl border-t border-slate-100 pt-6 text-xs text-slate-400">© 2026 NhuuChat. All rights reserved.</div></footer>;
}
