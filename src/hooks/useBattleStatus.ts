import { useEffect, useState } from "react";

export interface BattleStatus {
  online: boolean;
  pilots: number;
  bots: number;
  tickHz: number;
  snapshotHz: number;
}

/**
 * Mock battlefield status for the landing page.
 * Refreshes every 5s with a small random walk so the badge feels alive.
 * The game backend graft will replace this with real WebSocket presence data.
 */
export function useBattleStatus(refreshMs = 5000): BattleStatus {
  const [status, setStatus] = useState<BattleStatus>({
    online: true,
    pilots: 8,
    bots: 2,
    tickHz: 20,
    snapshotHz: 15,
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      setStatus((prev) => {
        const drift = Math.random() < 0.5 ? -1 : 1;
        const pilots = Math.min(24, Math.max(1, prev.pilots + drift));
        const bots = Math.max(0, 10 - pilots);
        return { ...prev, pilots, bots };
      });
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);

  return status;
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
