import { NextResponse } from "next/server";
import type { Address } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GM_CONTRACT =
  "0xE0712f5fB8b487Ba229bDeE27259c6D4B1696bfb" as Address;

const GM_EVENT_TOPIC =
  "0xe260dd3f3558e5fbd6a7b62e9eb1370f4660d1dca056ece3036cd21cd5d93ef6";

const BLOCKSCOUT_PUBLIC_BASE = "https://base.blockscout.com";
const BLOCKSCOUT_PRO_BASE = "https://api.blockscout.com/8453";

const TOP_LIMIT = 100;
const MAX_PAGES = 100;

type BlockscoutLog = {
  data?: string;
  topics?: string[];
  block_number?: number;
  index?: number;
};

type BlockscoutPage = {
  items?: BlockscoutLog[];
  next_page_params?: {
    block_number?: number;
    index?: number;
    items_count?: number;
  } | null;
};

type PlayerState = {
  address: Address;
  totalGM: number;
  streak: number;
  lastGMDay: number;
  lastBlock: number;
};

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function toSafeNumber(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Onchain value exceeded JavaScript safe integer range.");
  }

  return Number(value);
}

function parseUint256Word(data: string, wordIndex: number) {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const start = wordIndex * 64;
  const word = hex.slice(start, start + 64);

  if (word.length !== 64) {
    throw new Error("Unexpected GM event data length.");
  }

  return BigInt(`0x${word}`);
}

function parseIndexedAddress(topic: string) {
  const hex = topic.startsWith("0x") ? topic.slice(2) : topic;

  if (hex.length !== 64) {
    throw new Error("Unexpected indexed address topic.");
  }

  return `0x${hex.slice(24)}` as Address;
}

function getBlockscoutBaseUrl() {
  return process.env.BLOCKSCOUT_API_KEY
    ? BLOCKSCOUT_PRO_BASE
    : BLOCKSCOUT_PUBLIC_BASE;
}

function buildLogsUrl(
  nextPage:
    | {
        block_number?: number;
        index?: number;
        items_count?: number;
      }
    | null
) {
  const url = new URL(
    `${getBlockscoutBaseUrl()}/api/v2/addresses/${GM_CONTRACT}/logs`
  );

  if (process.env.BLOCKSCOUT_API_KEY) {
    url.searchParams.set("apikey", process.env.BLOCKSCOUT_API_KEY);
  }

  if (nextPage?.block_number !== undefined) {
    url.searchParams.set("block_number", String(nextPage.block_number));
  }

  if (nextPage?.index !== undefined) {
    url.searchParams.set("index", String(nextPage.index));
  }

  if (nextPage?.items_count !== undefined) {
    url.searchParams.set("items_count", String(nextPage.items_count));
  }

  return url.toString();
}

async function fetchBlockscoutPage(
  nextPage:
    | {
        block_number?: number;
        index?: number;
        items_count?: number;
      }
    | null
) {
  const response = await fetch(buildLogsUrl(nextPage), {
    headers: {
      Accept: "application/json",
    },
    next: {
      revalidate: 300,
    },
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Blockscout request failed (${response.status}): ${body.slice(0, 300)}`
    );
  }

  return (await response.json()) as BlockscoutPage;
}

async function buildLeaderboardFromBlockscout() {
  const players = new Map<string, PlayerState>();

  let nextPage:
    | {
        block_number?: number;
        index?: number;
        items_count?: number;
      }
    | null = null;

  let pageCount = 0;
  let highestBlock = 0;

  do {
    pageCount += 1;

    if (pageCount > MAX_PAGES) {
      throw new Error(
        `Blockscout pagination exceeded ${MAX_PAGES} pages.`
      );
    }

    const page = await fetchBlockscoutPage(nextPage);

    for (const log of page.items ?? []) {
      if (!log.topics || log.topics.length < 2 || !log.data) {
        continue;
      }

      if (normalizeAddress(log.topics[0]) !== GM_EVENT_TOPIC) {
        continue;
      }

      try {
        const user = parseIndexedAddress(log.topics[1]);
        const day = toSafeNumber(parseUint256Word(log.data, 0));
        const totalGM = toSafeNumber(parseUint256Word(log.data, 1));
        const currentStreak = toSafeNumber(parseUint256Word(log.data, 2));
        const blockNumber = log.block_number ?? 0;

        highestBlock = Math.max(highestBlock, blockNumber);

        const key = normalizeAddress(user);
        const existing = players.get(key);

        // Blockscout returns newest logs first, but this comparison also keeps
        // the code correct if ordering changes.
        if (existing && existing.lastBlock >= blockNumber) {
          continue;
        }

        players.set(key, {
          address: user,
          totalGM,
          streak: currentStreak,
          lastGMDay: day,
          lastBlock: blockNumber,
        });
      } catch (error) {
        console.warn("Skipping an undecodable GM event:", error);
      }
    }

    nextPage = page.next_page_params ?? null;
  } while (nextPage);

  return {
    players,
    highestBlock,
    pageCount,
  };
}

export async function GET() {
  try {
    const { players, highestBlock, pageCount } =
      await buildLeaderboardFromBlockscout();

    const today = Math.floor(Date.now() / 86_400_000);

    const allPlayers = [...players.values()].map((player) => {
      const activeStreak =
        player.lastGMDay >= today - 1 ? player.streak : 0;

      return {
        address: player.address,
        totalGM: player.totalGM,
        streak: activeStreak,
        recordedStreak: player.streak,
        lastGMDay: player.lastGMDay,
        gmToday: player.lastGMDay === today,
      };
    });

    const streak = [...allPlayers]
      .sort(
        (a, b) =>
          b.streak - a.streak ||
          b.totalGM - a.totalGM ||
          b.lastGMDay - a.lastGMDay
      )
      .slice(0, TOP_LIMIT);

    const totalGM = [...allPlayers]
      .sort(
        (a, b) =>
          b.totalGM - a.totalGM ||
          b.streak - a.streak ||
          b.lastGMDay - a.lastGMDay
      )
      .slice(0, TOP_LIMIT);

    const todayPlayers = allPlayers
      .filter((player) => player.gmToday)
      .sort(
        (a, b) =>
          b.streak - a.streak || b.totalGM - a.totalGM
      )
      .slice(0, TOP_LIMIT);

    return NextResponse.json(
      {
        chainId: 8453,
        contract: GM_CONTRACT,
        indexedToBlock: highestBlock,
        utcDay: today,
        generatedAt: new Date().toISOString(),
        dataSource: process.env.BLOCKSCOUT_API_KEY
          ? "Blockscout PRO API"
          : "Base Blockscout public REST API",
        pagesFetched: pageCount,
        playerCount: allPlayers.length,
        todayCount: todayPlayers.length,
        leaderboards: {
          streak,
          totalGM,
          today: todayPlayers,
        },
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=1800",
        },
      }
    );
  } catch (error) {
    console.error("Leaderboard API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not build the leaderboard.",
      },
      { status: 500 }
    );
  }
}
