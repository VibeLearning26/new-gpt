"use client";

import { Bolt } from "reicon-react";
import AnalyticsBoard from "@/components/analytics/AnalyticsBoard";
import QuickConfig from "@/components/QuickConfig";

export default function AdminAnalyticsPage() {
  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2.5">
          <Bolt size={22} className="text-brand-accent" />
          Analytics &amp; config
        </h1>
        <p className="text-sm text-muted mt-1">
          Platform usage, tokens and performance — plus quick system settings
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AnalyticsBoard />
        </div>
        <div className="lg:col-span-1">
          <QuickConfig />
        </div>
      </div>
    </div>
  );
}
