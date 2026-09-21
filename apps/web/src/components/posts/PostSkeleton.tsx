import * as React from "react";

export function PostSkeleton() {
  return <article className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="Đang tải bài viết">
    <div className="flex items-start gap-3">
      <div className="size-10 shrink-0 rounded-full bg-gray-200" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-2/5 rounded-lg bg-gray-200" />
        <div className="h-3 w-4/5 rounded-lg bg-gray-200" />
        <div className="h-3 w-3/5 rounded-lg bg-gray-200" />
      </div>
    </div>
    <div className="mt-4 space-y-2">
      <div className="h-3 w-full rounded-lg bg-gray-200" />
      <div className="h-3 w-11/12 rounded-lg bg-gray-200" />
    </div>
    <div className="mt-4 flex gap-2">
      <div className="h-8 w-16 rounded-lg bg-gray-200" />
      <div className="h-8 w-16 rounded-lg bg-gray-200" />
      <div className="h-8 w-16 rounded-lg bg-gray-200" />
    </div>
  </article>;
}
