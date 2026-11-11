"use client";

import React from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full flex-1 flex flex-col animate-page-enter">
      {children}
    </div>
  );
}
