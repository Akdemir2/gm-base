"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function shortenAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function Home() {
  const [showWallets, setShowWallets] = useState(false);

  const { address, isConnected, connector: activeConnector } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const baseAccountConnector = connectors.find(
    (connector) => connector.id === "baseAccount"
  );

  const otherConnectors = connectors.filter(
    (connector) => connector.id !== "baseAccount"
  );

  const connectWallet = (connector: (typeof connectors)[number]) => {
    connect(
      { connector },
      {
        onSuccess: () => {
          setShowWallets(false);
        },
      }
    );
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">

        <div className="mb-10">
          <div className="text-6xl mb-4">☀️</div>

          <h1 className="text-5xl font-bold tracking-tight">
            GM BASE
          </h1>

          <p className="mt-4 text-gray-400 text-lg">
            Start your day on Base.
          </p>
        </div>

        {!isConnected ? (
          <>
            <button
              onClick={() => setShowWallets(true)}
              className="w-full rounded-xl bg-white text-black py-4 font-semibold hover:bg-gray-200 transition"
            >
              Connect Wallet
            </button>

            {showWallets && (
              <div className="fixed inset-0 z-50 flex items-center justify-center px-6">

                <div
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  onClick={() => setShowWallets(false)}
                />

                <div className="relative w-full max-w-md rounded-3xl border border-gray-800 bg-gray-950 p-6 shadow-2xl">

                  <div className="flex items-center justify-between mb-6">
                    <div className="text-left">
                      <h2 className="text-xl font-bold">
                        Connect Wallet
                      </h2>

                      <p className="text-sm text-gray-500 mt-1">
                        Choose a wallet to continue
                      </p>
                    </div>

                    <button
                      onClick={() => setShowWallets(false)}
                      className="w-9 h-9 rounded-full text-gray-500 hover:text-white hover:bg-gray-900 text-2xl transition"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-3">

                    {baseAccountConnector && (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 text-left px-1">
                          Recommended
                        </p>

                        <button
                          disabled={isPending}
                          onClick={() =>
                            connectWallet(baseAccountConnector)
                          }
                          className="w-full flex items-center justify-between rounded-2xl bg-white text-black px-5 py-4 text-left hover:bg-gray-200 transition disabled:opacity-50"
                        >
                          <div>
                            <p className="font-semibold">
                              Base Account
                            </p>

                            <p className="text-xs text-gray-500 mt-1">
                              Native Base wallet
                            </p>
                          </div>

                          <span className="text-lg">
                            →
                          </span>
                        </button>
                      </>
                    )}

                    {otherConnectors.length > 0 && (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 text-left px-1 pt-3">
                          Other wallets
                        </p>

                        {otherConnectors.map((connector) => (
                          <button
                            key={connector.uid}
                            disabled={isPending}
                            onClick={() => connectWallet(connector)}
                            className="w-full flex items-center justify-between rounded-2xl border border-gray-800 bg-black px-5 py-4 text-left hover:bg-gray-900 hover:border-gray-700 transition disabled:opacity-50"
                          >
                            <span className="font-semibold">
                              {connector.name}
                            </span>

                            <span className="text-gray-500 text-lg">
                              →
                            </span>
                          </button>
                        ))}
                      </>
                    )}

                  </div>

                  {isPending && (
                    <p className="text-sm text-gray-500 mt-5">
                      Connecting...
                    </p>
                  )}

                  <p className="text-xs text-gray-600 text-center mt-6">
                    Compatible EVM wallets can connect to Base.
                  </p>

                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-6">

            <div className="rounded-3xl border border-gray-800 bg-gray-950 p-6 text-left">

              <div className="flex items-center justify-between">

                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider">
                    Connected wallet
                  </p>

                  <p className="mt-2 text-lg font-semibold">
                    {activeConnector?.name || "EVM Wallet"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-green-400">
                    Connected
                  </span>
                </div>

              </div>

              <div className="mt-6 rounded-2xl bg-black border border-gray-900 px-4 py-4">

                <p className="text-gray-500 text-xs mb-2">
                  Wallet address
                </p>

                <p className="font-mono text-sm break-all">
                  {shortenAddress(address)}
                </p>

              </div>

            </div>

            <button
              onClick={() => disconnect()}
              className="w-full rounded-xl border border-gray-700 py-4 font-semibold hover:bg-gray-900 transition"
            >
              Disconnect
            </button>

          </div>
        )}

        <p className="mt-10 text-sm text-gray-600">
          Built on Base
        </p>

      </div>
    </main>
  );
}
