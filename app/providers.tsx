"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount } from "wagmi/connectors";

const queryClient = new QueryClient();

const config = createConfig({
  chains: [base],

  connectors: [
    baseAccount({
      appName: "GM Base",
    }),
  ],

  transports: {
    [base.id]: http(),
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
