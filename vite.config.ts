import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import * as path from "path";
import { compileProto } from "./scripts/compile-proto";


// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl(), protobufPlugin()],
  server: {
    https: {},
  },
  preview: {
    https: {},
  },
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
