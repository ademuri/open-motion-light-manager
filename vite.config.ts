import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

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
  const protoDir = "proto/";
  const outputDir = "proto_out";
  const protoFiles = "proto/*.proto";

  // Helper function to compile protobuf files
  const compileProto = () => {
    // Ensure the output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`Created output directory: ${outputDir}`);
    }

    try {
      console.log("Compiling protobuf files...");
      execSync(
        `npx protoc --ts_out ${outputDir} --proto_path ${protoDir} --proto_path src/proto ${protoFiles}`,
        { stdio: "inherit" }
      );
      console.log("Protobuf files compiled successfully.");
    } catch (error) {
      console.error("Error compiling protobuf files:", error);
      throw error; // Re-throw to stop the build
    }
  };

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
