import * as React from "react";
import { DashboardTopbar, type DashboardAccount } from "../components/dashboard/DashboardTopbar.js";

export type DevelopmentSection = "Đơn hàng" | "Bài viết" | "Thống kê";

const developmentRouteBySection: Record<DevelopmentSection, string> = {
  "Đơn hàng": "/orders",
  "Bài viết": "/posts",
  "Thống kê": "/analytics"
};

const developmentSectionByRoute: Record<string, DevelopmentSection> = Object.fromEntries(
  Object.entries(developmentRouteBySection).map(([section, route]) => [route, section])
) as Record<string, DevelopmentSection>;

export function developmentPathForSection(section: DevelopmentSection): string {
  return developmentRouteBySection[section];
}

export function developmentSectionFromPath(pathname: string): DevelopmentSection {
  // Nếu người dùng mở route lạ, giữ màn hình an toàn ở mục đầu tiên chưa phát triển.
  return developmentSectionByRoute[pathname] ?? "Đơn hàng";
}

export function DevelopmentPage({ section, onLogoClick, onNavigate, user, onLogout, onProfile }: { section: DevelopmentSection; onLogoClick?: () => void; onNavigate?: (item: "Hội thoại" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt") => void; user?: DashboardAccount | null; onLogout?: () => void; onProfile?: () => void }) {
  return <main className="min-h-screen bg-gray-50 text-gray-800"><DashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile} /><section className="grid min-h-screen place-items-center px-6 pb-12 pt-24 text-center"><div><div className="mx-auto grid size-16 place-items-center rounded-full bg-sky-50 text-3xl text-sky-500">⋯</div><h1 className="mt-5 text-2xl font-bold text-gray-900">{section}</h1><p className="mt-2 text-sm text-gray-500">Chức năng đang được phát triển</p></div></section></main>;
}
