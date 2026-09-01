import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  appDirectory: "app",
  buildDirectory: "build",
  future: { v8_middleware: true },
} satisfies Config;
