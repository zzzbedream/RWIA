import {defineConfig, globalIgnores} from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    {
        // Allow underscore-prefixed args/vars without yelling — common for
        // "intentionally unused" interface stubs (e.g. SupabaseJobStore).
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                },
            ],
            // React 19 advisory rule — we intentionally setState in effects
            // for legitimate DOM probes (window.ronin) and async RNS lookup.
            // Keep as warning so developers see the hint without breaking CI.
            "react-hooks/set-state-in-effect": "warn",
        },
    },
    globalIgnores([
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
        // The Supabase store is a typed stub; suppress until the SQL impl lands.
        "src/lib/relayer/store/supabase.ts",
    ]),
]);

export default eslintConfig;
