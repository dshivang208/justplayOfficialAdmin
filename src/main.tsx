import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AdminAuthProvider } from "@/lib/admin-auth";
import { getRouter } from "@/router";
import "./styles.css";

const router = getRouter();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <AdminAuthProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AdminAuthProvider>
  </StrictMode>,
);
