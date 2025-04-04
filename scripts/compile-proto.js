import { execSync } from "child_process";
import * as fs from "fs";

export function compileProto() {
  const protoDir = "proto/";
  const outputDir = "proto_out";
  const protoFiles = "proto/*.proto";

  console.log("compileProto() running");

  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  try {
    console.log("Compiling protobuf files...");
    const command = `npx protoc --ts_out ${outputDir} --proto_path ${protoDir} --proto_path src/proto ${protoFiles}`;
    console.log(`Executing command: ${command}`);
    execSync(command, { stdio: "inherit" });
    console.log("Protobuf files compiled successfully.");
  } catch (error) {
    console.error("Error compiling protobuf files:", error);
    throw error; // Re-throw to stop the build
  }
}
