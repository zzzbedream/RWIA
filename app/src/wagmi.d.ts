import "wagmi";
import type {wagmiConfig} from "@/lib/wagmi";

declare module "wagmi" {
    interface Register {
        config: typeof wagmiConfig;
    }
}
