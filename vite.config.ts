import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import * as path from "path";
import { compileProto } from "./scripts/compile-proto.js";

const repoName = "open-motion-light-manager"; // Example

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const config = {
    plugins: [react(), basicSsl(), protobufPlugin()],
    server: {
      https: {},
    },
    preview: {
      https: {},
    },
    base: "/",
  };

  // Set base path only for production build, not for development server
  if (command === "build") {
    config.base = `/${repoName}/`;
  }

  return config;
});

function protobufPlugin(): Plugin {
  return {
    name: "vite-plugin-protobuf",
    enforce: "pre",
    buildStart() {
      compileProto();
    },
    configureServer(server) {
      // Watch for changes in .proto files and recompile
      const watcher = server.watcher;
      watcher.add(path.resolve(__dirname, "proto"));

      watcher.on("change", (filePath) => {
        if (filePath.endsWith(".proto")) {
          console.log(`Proto file changed: ${filePath}. Recompiling...`);
          try {
            compileProto();
          } catch (_error) {
            // Error already logged in compileProto, no need to re-log
            void _error;
          }
        }
      });
    },
  };
}
