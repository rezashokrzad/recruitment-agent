import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = { title: "پنل مدیریت استخدام" };

/** /admin — protected by proxy.ts. All data is loaded client-side from /api/candidates. */
export default function AdminPage() {
  return <AdminDashboard />;
}
