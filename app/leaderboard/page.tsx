"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  leaderboards: {
    streak: LeaderboardPlayer[];
    totalGM: LeaderboardPlayer[];
    today: LeaderboardPlayer[];
  };
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

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("streak");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

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

  const players = useMemo(() => {
    if (!data) return [];
    return data.leaderboards[activeTab];
  }, [activeTab, data]);

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

                  return (
                    <a
                      key={`${activeTab}-${player.address}`}
                      href={`https://basescan.org/address/${player.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 px-4 py-4 transition hover:bg-gray-950"
                    >
                      <div className="flex w-9 shrink-0 items-center justify-center text-sm font-bold text-gray-500">
                        {rankIcon(rank)}
                      </div>

                      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-800 bg-black font-mono text-xs text-gray-500">
                        <span>{fallbackAvatarLabel(player)}</span>

                        {profile?.pfpUrl && (
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
                        {profile ? (
                          <>
                            <p
                              className="truncate text-sm font-semibold text-gray-200"
                              title={profile.displayName}
                            >
                              @{profile.username}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[10px] text-gray-600">
                              {shortenAddress(player.address)}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-gray-700">
                              {secondaryForTab(player, activeTab)}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="truncate font-mono text-sm font-medium text-gray-300">
                              {shortenAddress(player.address)}
                            </p>
                            <p className="mt-1 text-[11px] text-gray-700">
                              {secondaryForTab(player, activeTab)}
                            </p>
                          </>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-white">
                          {valueForTab(player, activeTab)}
                        </p>
                        {player.gmToday && activeTab !== "today" && (
                          <p className="mt-1 text-[10px] font-medium text-green-500">
                            GM today ✓
                          </p>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

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
