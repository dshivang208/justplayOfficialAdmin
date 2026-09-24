import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// JustPlay Admin — internal ops console. Plain Vite SPA (no SSR needed for
// an internal tool behind auth), TanStack Router for client-side routing.
export default defineConfig({
  plugins: [tsconfigPaths(), react(), tailwindcss()],
  server: {
    host: true,
    port: 5174,
  },
});
