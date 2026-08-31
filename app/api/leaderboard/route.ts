import { NextResponse } from "next/server";
import type { Address } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GM_CONTRACT =
  "0xE0712f5fB8b487Ba229bDeE27259c6D4B1696bfb" as Address;

const DEPLOYMENT_BLOCK = 50618203;

// Verified from a real onchain GM log.
const GM_EVENT_TOPIC =
  "0xe26dd3f3558e5fbd6a7b62e9eb1370f4660d01dca056ece3036cd21cd5d93ef6";

const BLOCKSCOUT_API = "https://base.blockscout.com/api";
const TOP_LIMIT = 100;

type BlockscoutLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  logIndex?: string;
  transactionHash?: string;
};

type BlockscoutResponse = {
  status?: string;
  message?: string;
  result?: BlockscoutLog[] | string;
};

type PlayerState = {
  address: Address;
  totalGM: number;
  streak: number;
  lastGMDay: number;
  lastBlock: number;
  lastLogIndex: number;
};

function normalize(value: string) {
  return value.toLowerCase();
}

function hexToSafeNumber(value: string | undefined) {
  if (!value) return 0;

  const parsed = BigInt(value);

  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Onchain value exceeded JavaScript safe integer range.");
  }

  return Number(parsed);
}

function parseUint256Word(data: string, wordIndex: number) {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const start = wordIndex * 64;
  const word = hex.slice(start, start + 64);

  if (word.length !== 64) {
    throw new Error("Unexpected GM event data length.");
  }

  return hexToSafeNumber(`0x${word}`);
}

function parseIndexedAddress(topic: string) {
  const hex = topic.startsWith("0x") ? topic.slice(2) : topic;

  if (hex.length !== 64) {
    throw new Error("Unexpected indexed address topic.");
  }

  return `0x${hex.slice(24)}` as Address;
}

async function fetchGMLogs() {
  const url = new URL(BLOCKSCOUT_API);

  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("fromBlock", String(DEPLOYMENT_BLOCK));
  url.searchParams.set("toBlock", "latest");
  url.searchParams.set("address", GM_CONTRACT);
  url.searchParams.set("topic0", GM_EVENT_TOPIC);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    next: {
      revalidate: 300,
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Blockscout Logs API failed (${response.status}): ${text.slice(0, 300)}`
    );
  }

  let payload: BlockscoutResponse;

  try {
    payload = JSON.parse(text) as BlockscoutResponse;
  } catch {
    throw new Error(
      `Blockscout Logs API returned invalid JSON: ${text.slice(0, 300)}`
    );
  }

  if (!Array.isArray(payload.result)) {
    const resultText =
      typeof payload.result === "string" ? payload.result : "";

    const noRecords =
      payload.status === "0" &&
      /no (records|logs|transactions) found/i.test(
        `${payload.message ?? ""} ${resultText}`
      );

    if (noRecords) return [];

    throw new Error(
      `Blockscout Logs API error: ${
        resultText || payload.message || "Unknown response"
      }`
    );
  }

  return payload.result;
}

async function buildLeaderboard() {
  const logs = await fetchGMLogs();
  const players = new Map<string, PlayerState>();

  let highestBlock = 0;

  for (const log of logs) {
    // Real GM event layout:
    // topic0 = event signature
    // topic1 = indexed user address
    // topic2 = indexed UTC day
    // data[0] = totalGM
    // data[1] = currentStreak
    if (!log.topics || log.topics.length < 3 || !log.data) continue;

    if (normalize(log.topics[0]) !== GM_EVENT_TOPIC) continue;

    try {
      const user = parseIndexedAddress(log.topics[1]);
      const day = hexToSafeNumber(log.topics[2]);
      const totalGM = parseUint256Word(log.data, 0);
      const currentStreak = parseUint256Word(log.data, 1);
      const blockNumber = hexToSafeNumber(log.blockNumber);
      const logIndex = hexToSafeNumber(log.logIndex);

      highestBlock = Math.max(highestBlock, blockNumber);

      const key = normalize(user);
      const existing = players.get(key);

      if (
        existing &&
        (existing.lastBlock > blockNumber ||
          (existing.lastBlock === blockNumber &&
            existing.lastLogIndex >= logIndex))
      ) {
        continue;
      }

      players.set(key, {
        address: user,
        totalGM,
        streak: currentStreak,
        lastGMDay: day,
        lastBlock: blockNumber,
        lastLogIndex: logIndex,
      });
    } catch (error) {
      console.warn("Skipping an undecodable GM event:", error);
    }
  }

  return {
    players,
    highestBlock,
    eventCount: logs.length,
  };
}

export async function GET() {
  try {
    const { players, highestBlock, eventCount } = await buildLeaderboard();
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
        deploymentBlock: DEPLOYMENT_BLOCK,
        indexedToBlock: highestBlock,
        utcDay: today,
        generatedAt: new Date().toISOString(),
        dataSource: "Base Blockscout Logs API",
        eventCount,
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
