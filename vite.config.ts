import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl({
      /** name of certification */
      name: "test",
    }),
  ],
  server: {
    https: true,
  },
  preview: {
    https: true,
  },
});
