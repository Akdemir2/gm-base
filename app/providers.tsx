"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { baseAccount } from "wagmi/connectors";

const queryClient = new QueryClient();

const config = createConfig({
  chains: [baseSepolia],

  connectors: [
    baseAccount({
      appName: "GM Base",
    }),
  ],

  transports: {
    [baseSepolia.id]: http(),
  },
});

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}