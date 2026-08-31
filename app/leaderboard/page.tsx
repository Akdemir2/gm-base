"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

type Tab = "streak" | "totalGM" | "today";

type FarcasterProfile = {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
};

type LeaderboardPlayer = {
  address: string;
  totalGM: number;
  streak: number;
  recordedStreak: number;
  lastGMDay: number;
  gmToday: boolean;
  farcaster: FarcasterProfile | null;
};

type LeaderboardResponse = {
  chainId: number;
  contract: string;
  deploymentBlock: number;
  indexedToBlock: number;
  utcDay: number;
  generatedAt: string;
  playerCount: number;
  todayCount: number;
  farcasterProfileCount?: number;
  viewerRanks?: {
    streak: { rank: number; player: LeaderboardPlayer } | null;
    totalGM: { rank: number; player: LeaderboardPlayer } | null;
    today: { rank: number; player: LeaderboardPlayer } | null;
  };
  leaderboards: {
    streak: LeaderboardPlayer[];
    totalGM: LeaderboardPlayer[];
    today: LeaderboardPlayer[];
  };
};

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (...args: unknown[]) => unknown;
  removeListener?: (...args: unknown[]) => unknown;
};

const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: "streak", icon: "🔥", label: "Streak" },
  { id: "totalGM", icon: "👋", label: "Total GM" },
  { id: "today", icon: "⚡", label: "Today" },
];

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function rankIcon(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function valueForTab(player: LeaderboardPlayer, tab: Tab) {
  if (tab === "totalGM") {
    return `${player.totalGM} ${player.totalGM === 1 ? "GM" : "GMs"}`;
  }

  return `${player.streak} ${player.streak === 1 ? "day" : "days"}`;
}

function secondaryForTab(player: LeaderboardPlayer, tab: Tab) {
  if (tab === "totalGM") {
    return `${player.streak} day streak`;
  }

  return `${player.totalGM} total ${player.totalGM === 1 ? "GM" : "GMs"}`;
}

function fallbackAvatarLabel(player: LeaderboardPlayer) {
  if (player.farcaster?.username) {
    return player.farcaster.username.slice(0, 2).toUpperCase();
  }

  return player.address.slice(2, 4).toUpperCase();
}

function farcasterProfileUrl(username: string) {
  return `https://farcaster.xyz/${encodeURIComponent(username)}`;
}

function baseScanAddressUrl(address: string) {
  return `https://basescan.org/address/${address}`;
}

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("streak");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [viewerAddress, setViewerAddress] = useState<string | null>(null);
  const [viewerRanks, setViewerRanks] = useState<
    LeaderboardResponse["viewerRanks"] | null
  >(null);

  const loadLeaderboard = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const response = await fetch("/api/leaderboard", {
        cache: "no-store",
      });

      const payload = (await response.json()) as
        | LeaderboardResponse
        | { error?: string };

      if (!response.ok || !("leaderboards" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Could not load leaderboard."
        );
      }

      setData(payload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load leaderboard."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);




  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const setAddressFromAccounts = (accounts: unknown) => {
      if (
        !cancelled &&
        Array.isArray(accounts) &&
        typeof accounts[0] === "string"
      ) {
        setViewerAddress(accounts[0].toLowerCase());
        return true;
      }

      return false;
    };

    const attachProvider = async (provider: WalletProvider) => {
      try {
        const accounts = await provider.request({ method: "eth_accounts" });
        const found = setAddressFromAccounts(accounts);

        const handleAccountsChanged = (...args: unknown[]) => {
          const changedAccounts = args[0];

          if (
            Array.isArray(changedAccounts) &&
            typeof changedAccounts[0] === "string"
          ) {
            setViewerAddress(changedAccounts[0].toLowerCase());
          } else if (!cancelled) {
            setViewerAddress(null);
          }
        };

        provider.on?.("accountsChanged", handleAccountsChanged);

        cleanup = () => {
          provider.removeListener?.("accountsChanged", handleAccountsChanged);
        };

        return found;
      } catch (error) {
        console.warn("Passive wallet detection failed:", error);
        return false;
      }
    };

    const resolveViewerWallet = async () => {
      const params = new URLSearchParams(window.location.search);
      const viewerFromUrl = params.get("viewer");

      if (
        viewerFromUrl &&
        /^0x[a-fA-F0-9]{40}$/.test(viewerFromUrl)
      ) {
        setViewerAddress(viewerFromUrl.toLowerCase());
        return;
      }

      try {
        const inMiniApp = await Promise.race([
          sdk.isInMiniApp(),
          new Promise<boolean>((resolve) =>
            window.setTimeout(() => resolve(false), 1000)
          ),
        ]);

        if (cancelled) return;

        if (inMiniApp) {
          const farcasterProvider =
            (await sdk.wallet.getEthereumProvider()) as unknown as WalletProvider;

          if (cancelled) return;

          const found = await attachProvider(farcasterProvider);
          if (found) return;
        }
      } catch (error) {
        console.warn("Farcaster wallet detection unavailable:", error);
      }

      const browserProvider = (
        window as typeof window & {
          ethereum?: WalletProvider;
        }
      ).ethereum;

      if (browserProvider) {
        const found = await attachProvider(browserProvider);

        if (!found && !cancelled) {
          setViewerAddress(null);
        }
      } else if (!cancelled) {
        setViewerAddress(null);
      }
    };

    void resolveViewerWallet();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadViewerRanks = async () => {
      if (!viewerAddress) {
        setViewerRanks(null);
        return;
      }


      try {
        const response = await fetch(
          `/api/leaderboard?viewer=${encodeURIComponent(viewerAddress)}`,
          { cache: "no-store" }
        );

        const payload = (await response.json()) as
          | LeaderboardResponse
          | { error?: string };

        if (
          cancelled ||
          !response.ok ||
          !("leaderboards" in payload)
        ) {
          return;
        }

        setViewerRanks(payload.viewerRanks ?? null);
      } catch (error) {
        if (!cancelled) {
          console.warn("Could not load viewer rank:", error);
          setViewerRanks(null);
        }
      }
    };

    void loadViewerRanks();

    return () => {
      cancelled = true;
    };
  }, [viewerAddress]);

  const players = useMemo(() => {
    if (!data) return [];
    return data.leaderboards[activeTab];
  }, [activeTab, data]);

  const viewerRank = viewerRanks?.[activeTab] ?? null;

  const viewerIsVisible = useMemo(() => {
    if (!viewerAddress) return false;

    return players.some(
      (player) => player.address.toLowerCase() === viewerAddress
    );
  }, [players, viewerAddress]);

  const showYourRank =
    Boolean(viewerAddress) &&
    Boolean(viewerRank) &&
    !viewerIsVisible;

  const openFarcasterProfile = useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>, username: string) => {
      const url = farcasterProfileUrl(username);

      try {
        const inMiniApp = await sdk.isInMiniApp();

        if (inMiniApp) {
          event.preventDefault();
          await sdk.actions.openUrl({ url });
        }
      } catch (error) {
        console.warn("Native Farcaster profile navigation failed:", error);
        // Keep the normal anchor behavior as the fallback.
      }
    },
    []
  );

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 py-8 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <a
            href="/"
            className="flex min-w-0 items-center gap-3 transition hover:opacity-80"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-800 bg-gray-950 text-2xl">
              ☀️
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight">
                GM BASE
              </h1>
              <p className="truncate text-xs text-gray-600">
                Onchain leaderboard
              </p>
            </div>
          </a>

          <a
            href="/"
            className="shrink-0 rounded-full border border-gray-800 bg-gray-950 px-3 py-1.5 text-[11px] font-medium text-gray-500 transition hover:border-gray-700 hover:text-white"
          >
            ← GM
          </a>
        </header>

        <section className="pt-10">
          <div className="rounded-[2rem] border border-gray-900 bg-gray-950/60 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
                  Leaderboard
                </p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">
                  GM together. Climb together.
                </h2>
                <p className="mt-3 text-sm leading-6 text-gray-500">
                  Ranked from GM Base activity on Base Mainnet.
                </p>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gray-800 bg-black text-2xl">
                🏆
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gray-900 bg-black p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-gray-700">
                  Players
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {data ? data.playerCount : "—"}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-900 bg-black p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-gray-700">
                  GM today
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {data ? data.todayCount : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-gray-900 bg-gray-950/60 p-1.5">
            {TABS.map((tab) => {
              const selected = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-xl px-2 py-3 text-xs font-semibold transition ${
                    selected
                      ? "bg-white text-black"
                      : "text-gray-600 hover:bg-gray-900 hover:text-white"
                  }`}
                >
                  <span className="mr-1">{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>


          <div className="mt-5 overflow-hidden rounded-[2rem] border border-gray-900 bg-gray-950/40">
            <div className="flex items-center justify-between border-b border-gray-900 px-5 py-4">
              <div>
                <p className="text-sm font-semibold">
                  {TABS.find((tab) => tab.id === activeTab)?.icon}{" "}
                  {TABS.find((tab) => tab.id === activeTab)?.label}
                </p>
                <p className="mt-1 text-[11px] text-gray-700">
                  {activeTab === "today"
                    ? "Wallets that sent a GM this UTC day"
                    : activeTab === "totalGM"
                      ? "All-time GM count"
                      : "Active daily streak"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadLeaderboard(true)}
                disabled={refreshing}
                className="rounded-xl border border-gray-800 px-3 py-2 text-[11px] font-medium text-gray-600 transition hover:border-gray-700 hover:text-white disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div
                    key={item}
                    className="h-[76px] animate-pulse rounded-2xl border border-gray-900 bg-gray-950"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-center">
                <p className="text-sm font-semibold text-red-400">
                  Could not load leaderboard
                </p>
                <p className="mt-2 break-words text-xs leading-5 text-gray-600">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => void loadLeaderboard(true)}
                  className="mt-5 rounded-xl border border-gray-800 px-4 py-2.5 text-xs font-semibold text-gray-400 transition hover:text-white"
                >
                  Try again
                </button>
              </div>
            ) : players.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-3xl">👋</p>
                <p className="mt-3 text-sm font-semibold">No GM activity yet</p>
                <p className="mt-2 text-xs text-gray-600">
                  Be the first wallet on today&apos;s board.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-900">
                {players.map((player, index) => {
                  const rank = index + 1;
                  const profile = player.farcaster;
                  const isViewer =
                    viewerAddress === player.address.toLowerCase();

                  return (
                    <div
                      key={`${activeTab}-${player.address}`}
                      className={`flex items-center gap-3 px-4 py-4 transition ${
                        isViewer
                          ? "bg-white/[0.045] ring-1 ring-inset ring-white/10"
                          : "hover:bg-gray-950"
                      }`}
                    >
                      <div className="flex w-9 shrink-0 items-center justify-center text-sm font-bold text-gray-500">
                        {rankIcon(rank)}
                      </div>

                      {profile ? (
                        <a
                          href={farcasterProfileUrl(profile.username)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open @${profile.username} on Farcaster`}
                          title={`Open @${profile.username} on Farcaster`}
                          onClick={(event) =>
                            void openFarcasterProfile(event, profile.username)
                          }
                          className="group flex min-w-0 flex-1 items-center gap-3"
                        >
                          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-800 bg-black font-mono text-xs text-gray-500 transition group-hover:border-gray-700">
                            <span>{fallbackAvatarLabel(player)}</span>

                            {profile.pfpUrl && (
                              <img
                                src={profile.pfpUrl}
                                alt={`${profile.displayName || profile.username} avatar`}
                                className="absolute inset-0 h-full w-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(event) => {
                                  event.currentTarget.style.display = "none";
                                }}
                              />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <p
                                className="truncate text-sm font-semibold text-gray-200 transition group-hover:text-white"
                                title={profile.displayName}
                              >
                                @{profile.username}
                              </p>

                              {isViewer && (
                                <span className="shrink-0 rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[10px] text-gray-700">
                              {secondaryForTab(player, activeTab)}
                            </p>
                          </div>
                        </a>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-800 bg-black font-mono text-xs text-gray-500">
                            <span>{fallbackAvatarLabel(player)}</span>
                          </div>

                          <div className="min-w-0 flex-1">
                            {isViewer && (
                              <span className="inline-flex rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white">
                                You
                              </span>
                            )}

                            <p className={`${isViewer ? "mt-1" : ""} truncate text-[10px] text-gray-700`}>
                              {secondaryForTab(player, activeTab)}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-white">
                          {valueForTab(player, activeTab)}
                        </p>

                        {player.gmToday && activeTab !== "today" && (
                          <p className="mt-1 text-[10px] font-medium text-green-500">
                            GM today ✓
                          </p>
                        )}

                        <a
                          href={baseScanAddressUrl(player.address)}
                          target="_blank"
                          rel="noreferrer"
                          title="Open wallet on BaseScan"
                          className="mt-1 block font-mono text-[10px] text-gray-600 transition hover:text-gray-300"
                        >
                          {shortenAddress(player.address)}
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {showYourRank && viewerRank && (
            <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 ring-1 ring-inset ring-white/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                    Your rank
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xl font-bold text-white">
                      #{viewerRank.rank}
                    </span>
                    <span className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white">
                      You
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-700">
                    Outside the top 100 shown above
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-bold text-white">
                    {valueForTab(viewerRank.player, activeTab)}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-700">
                    {secondaryForTab(viewerRank.player, activeTab)}
                  </p>
                  <a
                    href={baseScanAddressUrl(viewerRank.player.address)}
                    target="_blank"
                    rel="noreferrer"
                    title="Open wallet on BaseScan"
                    className="mt-1 block font-mono text-[10px] text-gray-600 transition hover:text-gray-300"
                  >
                    {shortenAddress(viewerRank.player.address)}
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-gray-900 bg-gray-950/40 px-5 py-4">
            <div className="flex items-center justify-between gap-4 text-[11px] text-gray-700">
              <span>
                Base Mainnet · Onchain data
                {data?.farcasterProfileCount
                  ? ` · ${data.farcasterProfileCount} Farcaster ${
                      data.farcasterProfileCount === 1 ? "profile" : "profiles"
                    }`
                  : ""}
              </span>
              <span>{data ? `Block ${data.indexedToBlock}` : "Loading..."}</span>
            </div>
          </div>
        </section>

        <footer className="mt-auto flex items-center justify-center gap-2 pb-2 pt-10 text-xs text-gray-800">
          <span>Built on Base</span>
          <span>·</span>
          <span>GM Base V2</span>
        </footer>
      </div>
    </main>
  );
}
