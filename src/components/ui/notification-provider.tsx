"use client";

import { Toaster, toast } from "sonner";

export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast.info(message),
};

export function NotificationProvider() {
  return <Toaster richColors position="top-right" />;
}
