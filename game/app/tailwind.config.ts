import type { Config } from "tailwindcss";

export default {
  theme: {
    extend: {
      fontSize: {
        h1: ["1.5rem", { lineHeight: "1.2", fontWeight: "700" }],
        h2: ["1.25rem", { lineHeight: "1.3", fontWeight: "700" }],
        subtitle: ["1rem", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.6", fontWeight: "400" }],
        caption: ["0.75rem", { lineHeight: "1.5", fontWeight: "500" }],
        label: ["0.6875rem", { lineHeight: "1.4", fontWeight: "600" }],
        detail: ["0.625rem", { lineHeight: "1.4", fontWeight: "500" }],
      },
    },
  },
} satisfies Config;
