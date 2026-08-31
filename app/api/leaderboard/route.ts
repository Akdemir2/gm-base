import { NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
} from "viem";
import { base } from "viem/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GM_CONTRACT = "0xE0712f5fB8b487Ba229bDeE27259c6D4B1696bfb" as Address;
const DEPLOYMENT_BLOCK = BigInt("50618203");
const BLOCK_CHUNK_SIZE = BigInt("1900");
const TOP_LIMIT = 100;

const GM_EVENT = parseAbiItem(
  "event GM(address indexed user, uint256 day, uint256 totalGM, uint256 currentStreak)"
);

type PlayerState = {
  address: Address;
  totalGM: number;
  streak: number;
  lastGMDay: number;
  lastBlock: number;
};

type CachedIndex = {
  lastScannedBlock: bigint;
  players: Map<string, PlayerState>;
};

let memoryIndex: CachedIndex | null = null;
let updatePromise: Promise<CachedIndex> | null = null;

function getRpcUrl() {
  const rpcUrl = process.env.BASE_RPC_URL;

  if (!rpcUrl) {
    throw new Error("BASE_RPC_URL is not configured on the server.");
  }

  return rpcUrl;
}

function toSafeNumber(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Onchain value exceeded JavaScript safe integer range.");
  }

  return Number(value);
}

function normalizeAddress(address: Address) {
  return address.toLowerCase();
}

async function updateIndex() {
  if (updatePromise) return updatePromise;

  updatePromise = (async () => {
    const client = createPublicClient({
      chain: base,
      transport: http(getRpcUrl(), {
        retryCount: 3,
        retryDelay: 500,
        timeout: 20_000,
      }),
    });

    const latestBlock = await client.getBlockNumber();

    const players = memoryIndex
      ? new Map(memoryIndex.players)
      : new Map<string, PlayerState>();

    let fromBlock = memoryIndex
      ? memoryIndex.lastScannedBlock + BigInt(1)
      : DEPLOYMENT_BLOCK;

    if (fromBlock > latestBlock) {
      return (
        memoryIndex ?? {
          lastScannedBlock: latestBlock,
          players,
        }
      );
    }

    while (fromBlock <= latestBlock) {
      const toBlock =
        fromBlock + BLOCK_CHUNK_SIZE - BigInt(1) > latestBlock
          ? latestBlock
          : fromBlock + BLOCK_CHUNK_SIZE - BigInt(1);

      const logs = await client.getLogs({
        address: GM_CONTRACT,
        event: GM_EVENT,
        fromBlock,
        toBlock,
        strict: true,
      });

      for (const log of logs) {
        const { user, day, totalGM, currentStreak } = log.args;

        if (
          !user ||
          day === undefined ||
          totalGM === undefined ||
          currentStreak === undefined
        ) {
          continue;
        }

        const key = normalizeAddress(user);
        const blockNumber = toSafeNumber(log.blockNumber);
        const existing = players.get(key);

        if (existing && existing.lastBlock > blockNumber) {
          continue;
        }

        players.set(key, {
          address: user,
          totalGM: toSafeNumber(totalGM),
          streak: toSafeNumber(currentStreak),
          lastGMDay: toSafeNumber(day),
          lastBlock: blockNumber,
        });
      }

      fromBlock = toBlock + BigInt(1);
    }

    memoryIndex = {
      lastScannedBlock: latestBlock,
      players,
    };

    return memoryIndex;
  })();

  try {
    return await updatePromise;
  } finally {
    updatePromise = null;
  }
}

export async function GET() {
  try {
    const index = await updateIndex();
    const today = Math.floor(Date.now() / 86_400_000);

    const allPlayers = [...index.players.values()].map((player) => {
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
        deploymentBlock: Number(DEPLOYMENT_BLOCK),
        indexedToBlock: Number(index.lastScannedBlock),
        utcDay: today,
        generatedAt: new Date().toISOString(),
        playerCount: allPlayers.length,
        todayCount: allPlayers.filter((player) => player.gmToday).length,
        leaderboards: {
          streak,
          totalGM,
          today: todayPlayers,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
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
