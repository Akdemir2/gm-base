"use client";

import { useEffect, useRef, useState } from "react";
import type { EIP1193Provider } from "viem";
import { sdk } from "@farcaster/miniapp-sdk";

const GM_CONTRACT = "0xE0712f5fB8b487Ba229bDeE27259c6D4B1696bfb";
const BASE_MAINNET_CHAIN_ID = "0x2105";
const BASE_MAINNET_DECIMAL = 8453;
const GM_SELECTOR = "0xc0129d43";
const BUILDER_CODE = "bc_f54ls5g6";
const BUILDER_CODE_SUFFIX =
  "0x62635f6635346c733567360b0080218021802180218021802180218021";
const APP_URL = "https://gm-base-six.vercel.app/?card=2";
const FARCASTER_APP_URL = "https://gm-base-six.vercel.app";

type Hex = `0x${string}`;
type Address = `0x${string}`;
const GET_USER_STATS_SELECTOR = "0x4e43603a";
const CAN_GM_SELECTOR = "0xc7510bb6";
const GM_DATA_WITH_ATTRIBUTION =
  `${GM_SELECTOR}${BUILDER_CODE_SUFFIX.slice(2)}` as Hex;

type WalletProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

type WalletProvider = {
  info: WalletProviderInfo;
  provider: EIP1193Provider;
};

type Status =
  | "idle"
  | "checking"
  | "switching"
  | "estimating"
  | "sending"
  | "confirming"
  | "confirmed"
  | "already-gm"
  | "cancelled"
  | "error";

type Receipt = {
  status?: string;
  transactionHash?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
};

type WalletProgress = {
  totalGM: number;
  streak: number;
  lastGMDay: number;
};

function shortenAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function hexToNumber(hex?: string) {
  if (!hex) return 0;
  return parseInt(hex, 16);
}

function formatEthFromWei(wei: bigint) {
  const weiPerEth = BigInt("1000000000000000000");
  const whole = wei / weiPerEth;
  const fraction = (wei % weiPerEth)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction} ETH` : `${whole} ETH`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return message;
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getErrorCode(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    const code = (error as { code?: unknown }).code;

    if (typeof code === "number") {
      return code;
    }

    if (typeof code === "string") {
      const parsed = Number(code);

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function isAlreadyGMError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("already gm today") ||
    message.includes("alreadygm")
  );
}

function isUserRejectedError(error: unknown) {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();

  return (
    code === 4001 ||
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("denied request signature") ||
    message.includes("request signature: user denied") ||
    message.includes("request rejected")
  );
}

function encodeAddressArgument(address: string) {
  return address
    .toLowerCase()
    .replace(/^0x/, "")
    .padStart(64, "0");
}

function decodeUint256Words(data: string) {
  const hex = data.replace(/^0x/, "");

  if (hex.length < 64) {
    throw new Error("Contract returned invalid data.");
  }

  const words: bigint[] = [];

  for (let i = 0; i + 64 <= hex.length; i += 64) {
    words.push(BigInt(`0x${hex.slice(i, i + 64)}`));
  }

  return words;
}

function formatUtcDay(day: number) {
  if (!day) return "Never";

  const date = new Date(day * 86_400_000);

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type StreakMilestone = {
  days: number;
  icon: string;
  label: string;
};

const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 3, icon: "🔥", label: "3 day spark" },
  { days: 7, icon: "⚡", label: "7 day charge" },
  { days: 14, icon: "💎", label: "14 day diamond" },
  { days: 30, icon: "🏆", label: "30 day champion" },
  { days: 100, icon: "👑", label: "100 day legend" },
];

function getNextStreakMilestone(streak: number) {
  return STREAK_MILESTONES.find((milestone) => streak < milestone.days);
}

function getHighestUnlockedMilestone(streak: number) {
  return [...STREAK_MILESTONES]
    .reverse()
    .find((milestone) => streak >= milestone.days);
}

function getExactStreakMilestone(streak: number) {
  return STREAK_MILESTONES.find(
    (milestone) => milestone.days === streak
  );
}

export default function Home() {
  useEffect(() => {
    let cancelled = false;

    async function signalFarcasterReady() {
      try {
        const isMiniApp = await Promise.race([
          sdk.isInMiniApp(),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), 1500)
          ),
        ]);

        if (!cancelled && isMiniApp) {
          await sdk.actions.ready();
        }
      } catch (err) {
        console.info("Farcaster Mini App SDK unavailable:", err);
      }
    }

    void signalFarcasterReady();

    return () => {
      cancelled = true;
    };
  }, []);

  const [showWallets, setShowWallets] = useState(false);
  const [walletProviders, setWalletProviders] = useState<WalletProvider[]>([]);
  const [selectedProvider, setSelectedProvider] =
    useState<WalletProvider | null>(null);
  const [isFarcasterMiniApp, setIsFarcasterMiniApp] = useState(false);
  const [walletDiscoveryReady, setWalletDiscoveryReady] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isVerifyingAccount, setIsVerifyingAccount] = useState(false);
  const [isFarcasterAccountVerified, setIsFarcasterAccountVerified] =
    useState(false);
  const [address, setAddress] = useState<string | undefined>();
  const [chainId, setChainId] = useState<number | undefined>();
  const [status, setStatus] = useState<Status>("idle");
  const [txHash, setTxHash] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [estimatedFee, setEstimatedFee] = useState<string | undefined>();
  const [gmAvailable, setGmAvailable] = useState<boolean | undefined>();

  const [walletProgress, setWalletProgress] =
    useState<WalletProgress>({
      totalGM: 0,
      streak: 0,
      lastGMDay: 0,
    });

  const nextStreakMilestone = getNextStreakMilestone(
    walletProgress.streak
  );
  const highestUnlockedMilestone = getHighestUnlockedMilestone(
    walletProgress.streak
  );
  const exactUnlockedMilestone = getExactStreakMilestone(
    walletProgress.streak
  );
  const milestoneProgress = nextStreakMilestone
    ? Math.min(
        100,
        Math.round(
          (walletProgress.streak / nextStreakMilestone.days) * 100
        )
      )
    : 100;
  const daysToNextMilestone = nextStreakMilestone
    ? Math.max(0, nextStreakMilestone.days - walletProgress.streak)
    : 0;

  const lastGMCheckKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function discoverFarcasterWallet() {
      try {
        const inMiniApp = await Promise.race([
          sdk.isInMiniApp(),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), 1500)
          ),
        ]);

        if (cancelled) return;

        if (!inMiniApp) {
          setIsFarcasterMiniApp(false);
          setWalletDiscoveryReady(true);
          return;
        }

        setIsFarcasterMiniApp(true);

        const nativeProvider = await Promise.race([
          sdk.wallet.getEthereumProvider(),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 3000)
          ),
        ]);

        if (cancelled) return;

        if (nativeProvider) {
          const farcasterWallet: WalletProvider = {
            info: {
              uuid: "farcaster-native-wallet",
              name: "Farcaster Wallet",
              icon: "",
              rdns: "Farcaster Mini App",
            },
            provider: nativeProvider as EIP1193Provider,
          };

          setWalletProviders([farcasterWallet]);
        } else {
          console.info(
            "Farcaster wallet provider was not available; falling back to injected wallets."
          );
        }
      } catch (err) {
        console.info("Farcaster wallet discovery unavailable:", err);
      } finally {
        if (!cancelled) {
          setWalletDiscoveryReady(true);
        }
      }
    }

    void discoverFarcasterWallet();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isFarcasterMiniApp) return;

    const discovered = new Map<string, WalletProvider>();

    const handleProviderAnnouncement = (event: Event) => {
      const customEvent =
        event as CustomEvent<{
          info: WalletProviderInfo;
          provider: EIP1193Provider;
        }>;

      const detail = customEvent.detail;

      if (!detail?.info || !detail?.provider) return;

      discovered.set(detail.info.uuid, {
        info: detail.info,
        provider: detail.provider,
      });

      setWalletProviders(Array.from(discovered.values()));
    };

    window.addEventListener(
      "eip6963:announceProvider",
      handleProviderAnnouncement
    );

    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => {
      window.removeEventListener(
        "eip6963:announceProvider",
        handleProviderAnnouncement
      );
    };
  }, [isFarcasterMiniApp]);

  useEffect(() => {
    if (!selectedProvider) return;

    const provider = selectedProvider.provider;

    const handleAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];

      const nextAddress = list?.[0];

      setIsFarcasterAccountVerified(false);
      setAddress(nextAddress);
      setTxHash(undefined);
      setEstimatedFee(undefined);
      setGmAvailable(undefined);
      lastGMCheckKeyRef.current = null;
      setError("");

      if (!nextAddress) {
        setWalletProgress({
          totalGM: 0,
          streak: 0,
          lastGMDay: 0,
        });
        setStatus("idle");
        return;
      }

      void checkGMAvailability(provider, nextAddress);
    };

    const handleChainChanged = (chain: unknown) => {
      const nextChain = String(chain);

      setIsFarcasterAccountVerified(false);
      setChainId(hexToNumber(nextChain));
      setTxHash(undefined);
      setEstimatedFee(undefined);
      setGmAvailable(undefined);
      lastGMCheckKeyRef.current = null;
      setError("");

      if (nextChain === BASE_MAINNET_CHAIN_ID) {
        void checkGMAvailability(provider);
      } else {
        setStatus("idle");
      }
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [selectedProvider]);

  async function checkGMAvailability(
    provider: EIP1193Provider,
    account?: string,
    force = false
  ): Promise<WalletProgress | undefined> {
    let checkKey: string | null = null;

    try {
      const providerChain = (await provider.request({
        method: "eth_chainId",
      })) as string;

      if (providerChain !== BASE_MAINNET_CHAIN_ID) {
        lastGMCheckKeyRef.current = null;
        setGmAvailable(undefined);
        setWalletProgress({
          totalGM: 0,
          streak: 0,
          lastGMDay: 0,
        });
        setStatus("idle");
        return;
      }

      let sender = account;

      if (!sender) {
        const accounts = (await provider.request({
          method: "eth_accounts",
        })) as string[];

        sender = accounts?.[0];
      }

      if (!sender) {
        lastGMCheckKeyRef.current = null;
        setGmAvailable(undefined);
        setWalletProgress({
          totalGM: 0,
          streak: 0,
          lastGMDay: 0,
        });
        setStatus("idle");
        return;
      }

      const utcDay = new Date().toISOString().slice(0, 10);

      checkKey = [
        selectedProvider?.info.uuid ?? "provider",
        sender.toLowerCase(),
        providerChain.toLowerCase(),
        utcDay,
      ].join(":");

      if (!force && lastGMCheckKeyRef.current === checkKey) {
        return;
      }

      lastGMCheckKeyRef.current = checkKey;

      setStatus("checking");
      setError("");

      console.log("Reading GM V2 profile:", sender);

      const addressArg = encodeAddressArgument(sender);

      const [canGMResult, statsResult] = await Promise.all([
        provider.request({
          method: "eth_call",
          params: [
            {
              to: GM_CONTRACT,
              data: `${CAN_GM_SELECTOR}${addressArg}`,
            },
            "pending",
          ],
        }) as Promise<string>,
        provider.request({
          method: "eth_call",
          params: [
            {
              to: GM_CONTRACT,
              data: `${GET_USER_STATS_SELECTOR}${addressArg}`,
            },
            "pending",
          ],
        }) as Promise<string>,
      ]);

      const canGMWords = decodeUint256Words(canGMResult);
      const statsWords = decodeUint256Words(statsResult);

      const available = (canGMWords[0] ?? BigInt(0)) !== BigInt(0);

      if (statsWords.length < 3) {
        throw new Error("GM V2 returned incomplete profile data.");
      }

      const nextProgress: WalletProgress = {
        totalGM: Number(statsWords[0]),
        streak: Number(statsWords[1]),
        lastGMDay: Number(statsWords[2]),
      };

      console.log("GM V2 profile:", {
        available,
        ...nextProgress,
      });

      setWalletProgress(nextProgress);
      setGmAvailable(available);
      setStatus(available ? "idle" : "already-gm");

      return nextProgress;
    } catch (err) {
      if (
        checkKey &&
        lastGMCheckKeyRef.current === checkKey
      ) {
        lastGMCheckKeyRef.current = null;
      }

      console.warn(
        "GM V2 profile check failed:",
        getErrorMessage(err)
      );

      setGmAvailable(undefined);
      setStatus("idle");
    }
  }

  async function handleConnectClick() {
    if (isFarcasterMiniApp) {
      const farcasterWallet = walletProviders.find(
        (wallet) => wallet.info.uuid === "farcaster-native-wallet"
      );

      if (!farcasterWallet) {
        setError(
          walletDiscoveryReady
            ? "Farcaster wallet provider is unavailable."
            : "Preparing Farcaster wallet..."
        );
        return;
      }

      try {
        setIsConnectingWallet(true);
        await connectWallet(farcasterWallet);
      } finally {
        setIsConnectingWallet(false);
      }
      return;
    }

    setIsConnectingWallet(false);
    setShowWallets(true);
  }

  async function connectWallet(wallet: WalletProvider) {
    try {
      setError("");
      setStatus("idle");
      setTxHash(undefined);
      setEstimatedFee(undefined);
      setGmAvailable(undefined);
      lastGMCheckKeyRef.current = null;

      const accounts = (await wallet.provider.request({
        method: "eth_requestAccounts",
      })) as Address[];

      if (!accounts?.length) {
        throw new Error("The wallet did not return an account.");
      }

      const currentChain = (await wallet.provider.request({
        method: "eth_chainId",
      })) as string;

      setSelectedProvider(wallet);
      setIsFarcasterAccountVerified(
        wallet.info.uuid !== "farcaster-native-wallet"
      );
      setAddress(accounts[0]);
      setChainId(hexToNumber(currentChain));
      setShowWallets(false);

      if (currentChain === BASE_MAINNET_CHAIN_ID) {
        await checkGMAvailability(wallet.provider, accounts[0]);
      }
    } catch (err) {
      console.error("CONNECT ERROR:", err);
      setError(err instanceof Error ? err.message : "Wallet connection failed.");
    }
  }

  async function verifyFarcasterAccount() {
    if (
      !selectedProvider ||
      selectedProvider.info.uuid !== "farcaster-native-wallet"
    ) {
      return;
    }

    const provider = selectedProvider.provider;

    try {
      setError("");
      setIsVerifyingAccount(true);
      setIsFarcasterAccountVerified(false);
      setTxHash(undefined);
      setEstimatedFee(undefined);

      // Important: use eth_requestAccounts here, not only eth_accounts.
      // In Farcaster this gives the host / preferred external wallet a chance
      // to surface its wallet-selection / account-switch UI.
      const requestedAccounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as Address[];

      if (!requestedAccounts?.length) {
        throw new Error("The wallet did not return an account.");
      }

      // Re-read the provider after the interactive request has completed.
      const currentAccounts = (await provider.request({
        method: "eth_accounts",
      })) as Address[];

      const verifiedAddress =
        currentAccounts?.[0] ?? requestedAccounts[0];

      if (!verifiedAddress) {
        throw new Error("Could not verify the active wallet account.");
      }

      const currentChain = (await provider.request({
        method: "eth_chainId",
      })) as string;

      setAddress(verifiedAddress);
      setChainId(hexToNumber(currentChain));
      setGmAvailable(undefined);
      lastGMCheckKeyRef.current = null;

      if (currentChain === BASE_MAINNET_CHAIN_ID) {
        await checkGMAvailability(provider, verifiedAddress, true);
      } else {
        setStatus("idle");
      }

      // Only enable GM after the interactive account request has finished
      // and the account has been re-read from the provider.
      setIsFarcasterAccountVerified(true);
      setError("");
    } catch (err) {
      setIsFarcasterAccountVerified(false);

      if (isUserRejectedError(err)) {
        setError(
          "Wallet verification was cancelled. Verify or switch your wallet account before sending GM."
        );
        return;
      }

      console.error("FARCASTER ACCOUNT VERIFY ERROR:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not verify the Farcaster wallet account."
      );
    } finally {
      setIsVerifyingAccount(false);
    }
  }

  async function switchToBase() {
    if (!selectedProvider) {
      setError("No wallet is selected.");
      return;
    }

    try {
      setError("");
      setStatus("switching");

      await selectedProvider.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_MAINNET_CHAIN_ID }],
      });

      const verifiedChain = (await selectedProvider.provider.request({
        method: "eth_chainId",
      })) as string;

      const decimalChain = hexToNumber(verifiedChain);
      setChainId(decimalChain);

      if (verifiedChain !== BASE_MAINNET_CHAIN_ID) {
        throw new Error("Wallet could not be switched to Base.");
      }

      await checkGMAvailability(selectedProvider.provider);
    } catch (err) {
      console.error("NETWORK SWITCH ERROR:", err);
      setStatus("error");
      setError(
        err instanceof Error
          ? err.message
          : "Could not switch to Base."
      );
    }
  }

  async function waitForReceipt(
    provider: EIP1193Provider,
    hash: Hex
  ): Promise<Receipt> {
    for (let i = 0; i < 60; i++) {
      const receipt = await provider.request({
        method: "eth_getTransactionReceipt",
        params: [hash],
      });

      if (receipt) return receipt as Receipt;

      await sleep(2000);
    }

    throw new Error("Transaction was sent, but confirmation timed out.");
  }

  async function handleGM() {
    if (!selectedProvider) {
      setError("No wallet is selected.");
      return;
    }

    if (
      selectedProvider.info.uuid === "farcaster-native-wallet" &&
      !isFarcasterAccountVerified
    ) {
      setError(
        "Verify or switch your Farcaster wallet account before sending GM."
      );
      return;
    }

    if (gmAvailable === false) {
      setStatus("already-gm");
      setError("");
      return;
    }

    try {
      setError("");
      setTxHash(undefined);
      setEstimatedFee(undefined);
      setStatus("idle");

      const provider = selectedProvider.provider;

      let accounts = (await provider.request({
        method: "eth_accounts",
      })) as Address[];

      if (!accounts?.length) {
        accounts = (await provider.request({
          method: "eth_requestAccounts",
        })) as Address[];
      }

      if (!accounts?.length) {
        throw new Error(
          "No wallet account is available in the selected provider."
        );
      }

      const sender = accounts[0];

      if (
        address &&
        sender.toLowerCase() !== address.toLowerCase()
      ) {
        setAddress(sender);
        setIsFarcasterAccountVerified(false);
        setGmAvailable(undefined);
        lastGMCheckKeyRef.current = null;

        const currentChain = (await provider.request({
          method: "eth_chainId",
        })) as string;

        setChainId(hexToNumber(currentChain));

        if (currentChain === BASE_MAINNET_CHAIN_ID) {
          await checkGMAvailability(provider, sender, true);
        }

        throw new Error(
          "Your wallet account changed. The transaction was cancelled. Verify the displayed account, then send GM again."
        );
      }

      setAddress(sender);

      let providerChain = (await provider.request({
        method: "eth_chainId",
      })) as string;

      if (providerChain !== BASE_MAINNET_CHAIN_ID) {
        setStatus("switching");

        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_MAINNET_CHAIN_ID }],
        });

        providerChain = (await provider.request({
          method: "eth_chainId",
        })) as string;
      }

      if (providerChain !== BASE_MAINNET_CHAIN_ID) {
        throw new Error("Wallet is not connected to Base.");
      }

      setChainId(hexToNumber(providerChain));

      const contractCode = (await provider.request({
        method: "eth_getCode",
        params: [GM_CONTRACT, "latest"],
      })) as string;

      if (!contractCode || contractCode === "0x") {
        throw new Error(
          "GM Base V2 contract was not found on Base Mainnet. Transaction cancelled."
        );
      }

      setStatus("estimating");

      let gasEstimate: string;

      try {
        gasEstimate = (await provider.request({
          method: "eth_estimateGas",
          params: [
            {
              from: sender,
              to: GM_CONTRACT,
              data: GM_DATA_WITH_ATTRIBUTION,
            },
          ],
        })) as string;
      } catch (err) {
        if (isAlreadyGMError(err)) {
          console.log("GM status: already completed today");

          setGmAvailable(false);
          setStatus("already-gm");
          setError("");
          return;
        }

        throw err;
      }

      let gasPrice: string;

      try {
        gasPrice = (await provider.request({
          method: "eth_gasPrice",
        })) as string;
      } catch {
        gasPrice = "0x0";
      }

      const gas = BigInt(gasEstimate);
      const price = BigInt(gasPrice);
      const feeWei = gas * price;

      setEstimatedFee(formatEthFromWei(feeWei));

      console.log("Estimated GM gas:", gasEstimate);
      console.log("Network gas price:", gasPrice);
      console.log("Estimated transaction fee:", feeWei.toString(), "wei");
      console.log("Estimated transaction fee:", formatEthFromWei(feeWei));

      setStatus("sending");

      const transactionParams: Record<string, string> = {
        from: sender,
        to: GM_CONTRACT,
        data: GM_DATA_WITH_ATTRIBUTION,
        gas: gasEstimate,
      };

      if (gasPrice && gasPrice !== "0x0") {
        transactionParams.gasPrice = gasPrice;
      }

      console.log("GM Builder Code:", BUILDER_CODE);
      console.log("GM attribution suffix:", BUILDER_CODE_SUFFIX);
      console.log("GM transaction parameters:", transactionParams);

      const accountsBeforeSend = (await provider.request({
        method: "eth_accounts",
      })) as Address[];

      const accountBeforeSend = accountsBeforeSend?.[0];

      if (
        !accountBeforeSend ||
        accountBeforeSend.toLowerCase() !== sender.toLowerCase()
      ) {
        if (accountBeforeSend) {
          setAddress(accountBeforeSend);
        }

        setIsFarcasterAccountVerified(false);
        setGmAvailable(undefined);
        lastGMCheckKeyRef.current = null;

        if (accountBeforeSend) {
          await checkGMAvailability(
            provider,
            accountBeforeSend,
            true
          );
        }

        throw new Error(
          "Wallet account changed before signing. The GM transaction was cancelled. Verify the active account and try again."
        );
      }

      const txHashResult = (await provider.request({
        method: "eth_sendTransaction",
        params: [transactionParams],
      })) as Hex;

      setTxHash(txHashResult);
      setStatus("confirming");

      const receipt = await waitForReceipt(provider, txHashResult);

      if (receipt.status && receipt.status !== "0x1") {
        throw new Error("The GM transaction was mined but failed.");
      }

      setGmAvailable(false);
      setStatus("confirming");

      const previousTotalGM = walletProgress.totalGM;

      for (let attempt = 1; attempt <= 8; attempt += 1) {
        if (attempt > 1) {
          await sleep(1000);
        }

        lastGMCheckKeyRef.current = null;

        const refreshed = await checkGMAvailability(
          provider,
          sender,
          true
        );

        if (
          refreshed &&
          refreshed.totalGM > previousTotalGM
        ) {
          console.log(
            "GM V2 profile updated after confirmation:",
            refreshed
          );
          break;
        }

        console.log(
          `Waiting for wallet RPC to reflect confirmed GM (${attempt}/8)...`
        );
      }

      setGmAvailable(false);
      setStatus("confirmed");
    } catch (err) {
      if (isUserRejectedError(err)) {
        console.info("GM transaction cancelled by user.");

        setStatus("cancelled");
        setError("");
        return;
      }

      if (isAlreadyGMError(err)) {
        console.info("GM already completed for this wallet today.");

        setGmAvailable(false);
        setStatus("already-gm");
        setError("");
        return;
      }

      const message = getErrorMessage(err);

      console.error("GM ERROR:", err);

      setStatus("error");
      setError(message);
    }
  }

  async function shareMilestoneOnFarcaster(
    milestone: StreakMilestone
  ) {
    const shareText = [
      `${milestone.icon} ${milestone.days} DAY GM STREAK UNLOCKED`,
      "",
      `${milestone.days} days in a row on Base.`,
      "",
      "One GM. Every day. Onchain.",
      "",
      "Send yours 👇",
      APP_URL,
    ].join("\n");

    try {
      await sdk.actions.composeCast({
        text: shareText,
        embeds: [APP_URL],
      });
    } catch (err) {
      console.error("Farcaster milestone share failed:", err);
      setError("Could not open Farcaster share.");
    }
  }

  async function shareMilestoneOnX(
    milestone: StreakMilestone
  ) {
    if (typeof window === "undefined") return;

    const shareText = [
      `${milestone.icon} ${milestone.days} DAY GM STREAK UNLOCKED`,
      "",
      `${milestone.days} days in a row on Base.`,
      "",
      "One GM. Every day. Onchain.",
      "",
      "Send yours 👇",
      "",
      APP_URL,
      "@base",
    ].join("\n");

    const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(
      shareText
    )}`;

    if (isFarcasterMiniApp) {
      try {
        await sdk.actions.openUrl({ url: shareUrl });
        return;
      } catch (err) {
        console.info(
          "Farcaster openUrl unavailable for milestone share:",
          err
        );
      }
    }

    const opened = window.open(
      shareUrl,
      "_blank",
      "noopener,noreferrer"
    );

    if (!opened) {
      window.location.assign(shareUrl);
    }
  }

  async function shareOnX() {
    if (typeof window === "undefined") return;

    const streakText = `${walletProgress.streak} ${
      walletProgress.streak === 1 ? "day" : "days"
    } streak`;
    const totalText = `${walletProgress.totalGM} total ${
      walletProgress.totalGM === 1 ? "GM" : "GMs"
    }`;

    const shareText = [
      "👋 GM from Base!",
      "",
      "I just sent my daily GM onchain.",
      `🔥 ${streakText} · 👋 ${totalText}`,
      "",
      "One GM. Every day. Onchain.",
      "",
      "Send yours 👇",
      "",
      APP_URL,
      "@base",
    ].join("\n");

    const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(
      shareText
    )}`;

    if (isFarcasterMiniApp) {
      try {
        await sdk.actions.openUrl({ url: shareUrl });
        return;
      } catch (err) {
        console.info(
          "Farcaster openUrl unavailable; falling back to browser open:",
          err
        );
      }
    }

    const opened = window.open(
      shareUrl,
      "_blank",
      "noopener,noreferrer"
    );

    if (!opened) {
      window.location.assign(shareUrl);
    }
  }

  async function shareOnFarcaster() {
    if (typeof window === "undefined") return;

    const streakText = `${walletProgress.streak} ${
      walletProgress.streak === 1 ? "day" : "days"
    } streak`;
    const totalText = `${walletProgress.totalGM} total ${
      walletProgress.totalGM === 1 ? "GM" : "GMs"
    }`;

    const shareText = [
      "👋 GM from Base!",
      "",
      "I just sent my daily GM onchain.",
      `🔥 ${streakText} · 👋 ${totalText}`,
      "",
      "One GM. Every day. Onchain.",
      "",
      "Send yours 👇",
    ].join("\n");

    try {
      const isMiniApp = await Promise.race([
        sdk.isInMiniApp(),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 1500)
        ),
      ]);

      if (isMiniApp) {
        await sdk.actions.composeCast({
          text: shareText,
          embeds: [FARCASTER_APP_URL],
        });
        return;
      }
    } catch (err) {
      console.info("Farcaster native share unavailable:", err);
    }

    const params = new URLSearchParams();
    params.set("text", shareText);
    params.append("embeds[]", FARCASTER_APP_URL);

    const shareUrl = `https://farcaster.xyz/~/compose?${params.toString()}`;
    const opened = window.open(shareUrl, "_blank", "noopener,noreferrer");

    if (!opened) {
      window.location.href = shareUrl;
    }
  }

  async function disconnectWallet() {
    try {
      if (selectedProvider) {
        try {
          await selectedProvider.provider.request({
            method: "wallet_revokePermissions",
            params: [{ eth_accounts: {} }],
          });
        } catch {
          // Optional wallet method.
        }
      }
    } finally {
      setSelectedProvider(null);
      setIsFarcasterAccountVerified(false);
      setIsVerifyingAccount(false);
      setAddress(undefined);
      setChainId(undefined);
      setTxHash(undefined);
      setEstimatedFee(undefined);
      setGmAvailable(undefined);
      setWalletProgress({
        totalGM: 0,
        streak: 0,
        lastGMDay: 0,
      });
      lastGMCheckKeyRef.current = null;
      setStatus("idle");
      setError("");
    }
  }

  const isConnected = !!selectedProvider && !!address;

  const isBusy =
    isVerifyingAccount ||
    status === "checking" ||
    status === "switching" ||
    status === "estimating" ||
    status === "sending" ||
    status === "confirming";

  const gmCompletedToday =
    chainId === BASE_MAINNET_DECIMAL &&
    gmAvailable === false;

  const farcasterVerificationRequired =
    selectedProvider?.info.uuid === "farcaster-native-wallet";

  const gmReady =
    chainId === BASE_MAINNET_DECIMAL &&
    gmAvailable === true &&
    (!farcasterVerificationRequired || isFarcasterAccountVerified) &&
    !isBusy;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 py-8 sm:px-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-800 bg-gray-950 text-2xl">
              ☀️
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight">GM BASE</h1>
              <p className="text-xs text-gray-600">One GM. Every day. Onchain.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/leaderboard"
              className="rounded-full border border-gray-800 bg-gray-950 px-3 py-1.5 text-[11px] font-medium text-gray-500 transition hover:border-gray-700 hover:text-white"
            >
              🏆 Leaderboard
            </a>

            <span className="rounded-full border border-gray-800 bg-gray-950 px-3 py-1.5 text-[11px] font-medium text-gray-500">
              Base
            </span>
          </div>
        </header>

        <div className="flex flex-1 flex-col justify-center py-10">
          {!isConnected ? (
            <section className="space-y-8">
              <div className="py-8 text-center">
                <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] border border-gray-800 bg-gray-950 text-5xl shadow-2xl">
                  👋
                </div>

                <h2 className="text-4xl font-bold tracking-tight">
                  Start your day on Base.
                </h2>

                <p className="mx-auto mt-4 max-w-sm text-base leading-7 text-gray-500">
                  Connect a wallet, send one GM each UTC day, and build your
                  onchain streak.
                </p>
              </div>

              <button
                onClick={() => void handleConnectClick()}
                disabled={
                  isFarcasterMiniApp &&
                  (!walletDiscoveryReady || isConnectingWallet)
                }
                className="w-full rounded-2xl bg-white py-4 font-semibold text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFarcasterMiniApp && !walletDiscoveryReady
                  ? "Preparing wallet..."
                  : isFarcasterMiniApp && isConnectingWallet
                    ? "Connecting wallet..."
                    : "Connect wallet"}
              </button>

              {isFarcasterMiniApp && isConnectingWallet && (
                <p className="mt-3 text-center text-xs leading-5 text-gray-500">
                  Select your preferred wallet in Farcaster to continue.
                  If you use OKX, tap the OKX Wallet row to open its approval popup.
                </p>
              )}

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl border border-gray-900 bg-gray-950/60 p-3">
                  <p className="text-lg">🔗</p>
                  <p className="mt-2 text-[11px] text-gray-600">On-chain</p>
                </div>
                <div className="rounded-2xl border border-gray-900 bg-gray-950/60 p-3">
                  <p className="text-lg">🔥</p>
                  <p className="mt-2 text-[11px] text-gray-600">Daily streak</p>
                </div>
                <div className="rounded-2xl border border-gray-900 bg-gray-950/60 p-3">
                  <p className="text-lg">⚡</p>
                  <p className="mt-2 text-[11px] text-gray-600">Built on Base</p>
                </div>
              </div>

              {showWallets && !isFarcasterMiniApp && (
                <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:px-6">
                  <div
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    onClick={() => setShowWallets(false)}
                  />

                  <div className="relative w-full max-w-md rounded-t-[2rem] border border-gray-800 bg-gray-950 p-6 shadow-2xl sm:rounded-[2rem]">
                    <div className="mb-6 flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold">Choose a wallet</h2>
                        <p className="mt-1 text-sm text-gray-500">
                          {isFarcasterMiniApp
                            ? "Provided by Farcaster"
                            : "Detected in this browser"}
                        </p>
                      </div>

                      <button
                        onClick={() => setShowWallets(false)}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-gray-500 transition hover:bg-gray-900 hover:text-white"
                      >
                        ×
                      </button>
                    </div>

                    <div className="space-y-3">
                      {walletProviders.length === 0 ? (
                        <div className="rounded-2xl border border-gray-900 bg-black py-8 text-center text-sm text-gray-500">
                          {walletDiscoveryReady
                            ? "No wallet provider found."
                            : "Detecting wallets..."}
                        </div>
                      ) : (
                        walletProviders.map((wallet) => (
                          <button
                            key={wallet.info.uuid}
                            onClick={() => connectWallet(wallet)}
                            className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-black px-5 py-4 text-left transition hover:border-gray-700 hover:bg-gray-900"
                          >
                            <div className="flex items-center gap-3">
                              {wallet.info.icon ? (
                                <img
                                  src={wallet.info.icon}
                                  alt=""
                                  className="h-9 w-9 rounded-xl"
                                />
                              ) : (
                                <div className="h-9 w-9 rounded-xl bg-gray-900" />
                              )}

                              <div>
                                <p className="font-semibold">
                                  {wallet.info.name}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-600">
                                  {wallet.info.rdns}
                                </p>
                              </div>
                            </div>

                            <span className="text-gray-600">→</span>
                          </button>
                        ))
                      )}
                    </div>

                    {error && (
                      <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/30 p-4">
                        <p className="break-words text-sm text-red-400">
                          {error}
                        </p>
                      </div>
                    )}

                    <p className="mt-5 text-center text-[11px] text-gray-700">
                      {isFarcasterMiniApp
                        ? "Native Farcaster Mini App wallet provider"
                        : "Wallet discovery via EIP-6963"}
                    </p>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-gray-800 bg-gray-950 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {selectedProvider.info.icon ? (
                      <img
                        src={selectedProvider.info.icon}
                        alt=""
                        className="h-10 w-10 rounded-xl"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-gray-900" />
                    )}

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {selectedProvider.info.name}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-gray-600">
                        {shortenAddress(address)}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="rounded-full border border-gray-800 px-3 py-1.5 text-[11px] font-medium text-gray-500">
                      {selectedProvider.info.uuid === "farcaster-native-wallet"
                        ? "Farcaster native"
                        : "Browser wallet"}
                    </div>

                    <div className="flex items-center gap-2 rounded-full border border-gray-800 px-3 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      <span className="text-[11px] text-gray-500">
                        Connected
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {selectedProvider.info.uuid === "farcaster-native-wallet" && (
                <div
                  className={`rounded-[2rem] border p-5 ${
                    isFarcasterAccountVerified
                      ? "border-green-900 bg-green-950/20"
                      : "border-yellow-900 bg-yellow-950/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
                        Wallet account
                      </p>
                      <h3 className="mt-1 font-semibold">
                        {isFarcasterAccountVerified
                          ? "Account verified"
                          : "Verify before GM"}
                      </h3>
                      <p className="mt-2 text-xs leading-5 text-gray-500">
                        {isFarcasterAccountVerified
                          ? `GM will use ${shortenAddress(address)}.`
                          : "Open Farcaster's wallet selector and tap your preferred wallet row. For OKX, use Switch if you want another account."}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] ${
                        isFarcasterAccountVerified
                          ? "border-green-900 text-green-500"
                          : "border-yellow-900 text-yellow-500"
                      }`}
                    >
                      {isFarcasterAccountVerified ? "Verified" : "Required"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void verifyFarcasterAccount()}
                    disabled={isVerifyingAccount}
                    className="mt-4 w-full rounded-2xl border border-gray-700 bg-black py-3.5 text-sm font-semibold text-white transition hover:border-gray-500 hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isVerifyingAccount
                      ? "Waiting for wallet..."
                      : isFarcasterAccountVerified
                        ? "Switch / verify account again"
                        : "Verify / switch wallet account"}
                  </button>
                </div>
              )}

              {chainId !== BASE_MAINNET_DECIMAL ? (
                <div className="rounded-[2rem] border border-yellow-900 bg-yellow-950/20 p-6 text-center">
                  <div className="text-3xl">⚠️</div>
                  <h2 className="mt-3 text-xl font-bold">Wrong network</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Switch your wallet to Base to continue.
                  </p>

                  <button
                    disabled={isBusy}
                    onClick={switchToBase}
                    className="mt-5 w-full rounded-2xl bg-white py-4 font-semibold text-black transition hover:bg-gray-200 disabled:opacity-50"
                  >
                    {status === "switching"
                      ? "Switching..."
                      : "Switch to Base"}
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className={`rounded-[2rem] border p-6 text-center ${
                      gmCompletedToday
                        ? "border-green-900 bg-green-950/20"
                        : "border-gray-800 bg-gray-950"
                    }`}
                  >
                    <div className="text-5xl">
                      {gmCompletedToday ? "✓" : "👋"}
                    </div>

                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">
                      Today&apos;s GM
                    </p>

                    <h2 className="mt-2 text-3xl font-bold tracking-tight">
                      {status === "checking"
                        ? "Checking..."
                        : gmCompletedToday
                        ? "Completed"
                        : "Ready"}
                    </h2>

                    <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-gray-500">
                      {gmCompletedToday
                        ? "Your GM is onchain for today. Come back after the next UTC day begins."
                        : "Send today's GM and keep your onchain streak moving."}
                    </p>

                    {gmCompletedToday && (
                      <div className="mt-6 grid gap-3">
                        <button
                          onClick={shareOnFarcaster}
                          className="w-full rounded-2xl bg-[#855DCD] py-4 text-base font-bold text-white transition hover:opacity-90"
                        >
                          Share on Farcaster ↗
                        </button>

                        <button
                          onClick={shareOnX}
                          className="w-full rounded-2xl border border-gray-700 bg-black py-4 text-base font-bold text-white transition hover:border-gray-500 hover:bg-gray-900"
                        >
                          Share on X ↗
                        </button>

                    {exactUnlockedMilestone && (
                      <div className="mt-5 rounded-[2rem] border border-yellow-900 bg-yellow-950/20 p-5 text-left">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-yellow-700">
                              Milestone unlocked
                            </p>
                            <div className="mt-3 flex items-center gap-3">
                              <span className="text-4xl">
                                {exactUnlockedMilestone.icon}
                              </span>
                              <div>
                                <h3 className="text-lg font-bold text-white">
                                  {exactUnlockedMilestone.days} DAY STREAK
                                </h3>
                                <p className="mt-1 text-xs leading-5 text-gray-500">
                                  {exactUnlockedMilestone.days} days in a row on Base.
                                </p>
                              </div>
                            </div>
                          </div>

                          <span className="rounded-full border border-yellow-900 px-3 py-1 text-[11px] font-medium text-yellow-500">
                            Unlocked
                          </span>
                        </div>

                        <p className="mt-4 text-xs leading-5 text-gray-500">
                          One GM. Every day. Onchain. Share your streak milestone.
                        </p>

                        {isFarcasterMiniApp && (
                          <button
                            type="button"
                            onClick={() =>
                              void shareMilestoneOnFarcaster(
                                exactUnlockedMilestone
                              )
                            }
                            className="mt-4 w-full rounded-2xl bg-[#8556D8] py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            Share achievement on Farcaster ↗
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            void shareMilestoneOnX(
                              exactUnlockedMilestone
                            )
                          }
                          className="mt-3 w-full rounded-2xl border border-gray-700 bg-black py-3.5 text-sm font-semibold text-white transition hover:border-gray-500 hover:bg-gray-900"
                        >
                          Share achievement on X ↗
                        </button>
                      </div>
                    )}

                      </div>
                    )}

                    {!gmCompletedToday && (
                      <button
                        disabled={!gmReady}
                        onClick={handleGM}
                        className="mt-6 w-full rounded-2xl bg-white py-4 text-base font-bold text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {farcasterVerificationRequired &&
                        !isFarcasterAccountVerified
                          ? "Verify wallet account first"
                          : status === "checking"
                          ? "Checking..."
                          : status === "estimating"
                          ? "Preparing transaction..."
                          : status === "sending"
                          ? "Open your wallet..."
                          : status === "confirming"
                          ? "Confirming on Base..."
                          : "GM 👋"}
                      </button>
                    )}

                    {estimatedFee && !gmCompletedToday && (
                      <p className="mt-3 text-xs text-gray-700">
                        Estimated fee {estimatedFee}
                      </p>
                    )}
                  </div>

                  <div className="rounded-[2rem] border border-gray-800 bg-gray-950 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-700">
                          Profile
                        </p>
                        <h3 className="mt-1 font-semibold">Your GM progress</h3>
                      </div>

                      <span className="rounded-full border border-gray-800 px-3 py-1 text-[11px] text-gray-600">
                        On-chain
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-gray-900 bg-black p-4">
                        <p className="text-xs text-gray-600">Current streak</p>
                        <div className="mt-2 flex items-end gap-2">
                          <span className="text-3xl font-bold">
                            {walletProgress.streak}
                          </span>
                          <span className="pb-1 text-sm text-gray-600">
                            {walletProgress.streak === 1 ? "day" : "days"}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-900 bg-black p-4">
                        <p className="text-xs text-gray-600">Total GM</p>
                        <div className="mt-2 flex items-end gap-2">
                          <span className="text-3xl font-bold">
                            {walletProgress.totalGM}
                          </span>
                          <span className="pb-1 text-sm text-gray-600">
                            onchain
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-2xl border border-gray-900 bg-black px-4 py-3">
                      <span className="text-xs text-gray-600">Last GM</span>
                      <span className="text-xs font-medium text-gray-400">
                        {formatUtcDay(walletProgress.lastGMDay)}
                      </span>
                    </div>

                    <div className="mt-3 rounded-2xl border border-gray-900 bg-black p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-gray-700">
                            Streak milestones
                          </p>

                          {nextStreakMilestone ? (
                            <>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-2xl">
                                  {nextStreakMilestone.icon}
                                </span>
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    Next: {nextStreakMilestone.days} day streak
                                  </p>
                                  <p className="mt-0.5 text-xs text-gray-600">
                                    {daysToNextMilestone === 1
                                      ? "1 day to go"
                                      : `${daysToNextMilestone} days to go`}
                                  </p>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-2xl">👑</span>
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  100 day legend unlocked
                                </p>
                                <p className="mt-0.5 text-xs text-gray-600">
                                  Every listed milestone is unlocked.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <span className="rounded-full border border-gray-800 px-3 py-1 text-[11px] text-gray-500">
                          {milestoneProgress}%
                        </span>
                      </div>

                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-900">
                        <div
                          className="h-full rounded-full bg-white transition-all duration-500"
                          style={{ width: `${milestoneProgress}%` }}
                        />
                      </div>

                      <div className="mt-4 grid grid-cols-5 gap-2">
                        {STREAK_MILESTONES.map((milestone) => {
                          const unlocked =
                            walletProgress.streak >= milestone.days;

                          return (
                            <div
                              key={milestone.days}
                              className={`rounded-xl border px-2 py-3 text-center ${
                                unlocked
                                  ? "border-green-900 bg-green-950/20"
                                  : "border-gray-900 bg-gray-950"
                              }`}
                              title={milestone.label}
                            >
                              <div
                                className={`text-lg ${
                                  unlocked ? "" : "grayscale opacity-30"
                                }`}
                              >
                                {milestone.icon}
                              </div>
                              <p
                                className={`mt-1 text-[10px] font-semibold ${
                                  unlocked
                                    ? "text-green-500"
                                    : "text-gray-700"
                                }`}
                              >
                                {milestone.days}d
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {highestUnlockedMilestone && (
                        <p className="mt-3 text-xs text-gray-600">
                          Latest unlocked:{" "}
                          <span className="font-medium text-gray-400">
                            {highestUnlockedMilestone.icon}{" "}
                            {highestUnlockedMilestone.days} day streak
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {status === "confirming" && txHash && (
                    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
                        <div>
                          <p className="text-sm font-medium">
                            GM sent to Base
                          </p>
                          <p className="mt-0.5 text-xs text-gray-600">
                            Waiting for onchain confirmation...
                          </p>
                        </div>
                      </div>

                      <a
                        href={`https://basescan.org/tx/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 block truncate font-mono text-xs text-blue-400 hover:underline"
                      >
                        View transaction ↗
                      </a>
                    </div>
                  )}

                  {status === "confirmed" && txHash && (
                    <div className="rounded-2xl border border-green-900 bg-green-950/20 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-green-400">
                            GM confirmed
                          </p>
                          <p className="mt-1 text-xs text-gray-600">
                            Your profile has been updated onchain.
                          </p>
                        </div>

                        <a
                          href={`https://basescan.org/tx/${txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs text-blue-400 hover:underline"
                        >
                          Explorer ↗
                        </a>
                      </div>
                    </div>
                  )}

                  {status === "cancelled" && (
                    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                      <p className="text-sm font-medium">
                        Transaction cancelled
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        Nothing was submitted and no gas was spent.
                      </p>
                    </div>
                  )}

                  {status === "error" && error && (
                    <div className="rounded-2xl border border-red-900 bg-red-950/20 p-4">
                      <p className="text-sm font-semibold text-red-400">
                        Transaction failed
                      </p>
                      <p className="mt-2 break-words text-xs leading-5 text-gray-500">
                        {error}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between px-1 pt-1">
                    <div>
                      <p className="text-[11px] text-gray-700">
                        Base Mainnet · Chain ID 8453
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-gray-800">
                        {shortenAddress(GM_CONTRACT)}
                      </p>
                    </div>

                    <button
                      onClick={disconnectWallet}
                      className="rounded-xl border border-gray-800 px-4 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-950 hover:text-white"
                    >
                      Disconnect
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        <footer className="flex items-center justify-center gap-2 pb-2 text-xs text-gray-800">
          <span>Built on Base</span>
          <span>·</span>
          <span>GM Base V2</span>
        </footer>
      </div>
    </main>
  );
}
