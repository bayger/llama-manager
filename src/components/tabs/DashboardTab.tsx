import React from "react";
import { Box, Text } from "ink";
import { loadConfig, ConfigData } from "../../lib/config.js";
import { getServerMetrics } from "../../lib/api.js";
import { getStatus } from "../../lib/server.js";
import { theme } from "../../lib/theme.js";

interface DashboardMetrics {
  promptTokensPerSec: number;
  predictedTokensPerSec: number;
  totalTokens: number;
  requestsProcessing: number;
  requestsDeferred: number;
  promptSecondsTotal: number;
  tokensPredictedSecondsTotal: number;
  nDecodeTotal: number;
  nTokensMax: number;
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Text color={theme.textMuted}>{label}</Text>
      <Text color={color || theme.text}> {value}</Text>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={theme.accent}>{title}</Text>
      </Box>
      {children}
    </Box>
  );
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

export default function DashboardTab({ message, showMessage, setIsTextInputFocused }: { message: string | null; showMessage: (msg: string) => void; setIsTextInputFocused: (focused: boolean) => void }) {
  const [metrics, setMetrics] = React.useState<DashboardMetrics | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [lastPoll, setLastPoll] = React.useState<number | null>(null);
  const configRef = React.useRef<ConfigData | null>(null);

  React.useEffect(() => {
    loadConfig().then((cfg: ConfigData) => {
      configRef.current = cfg;
    });
  }, []);

  const poll = async () => {
    const cfg = configRef.current;
    if (!cfg) return;
    try {
      const raw = await getServerMetrics(cfg);
      const m: DashboardMetrics = {
        promptTokensPerSec: raw.promptTokensPerSec,
        predictedTokensPerSec: raw.predictedTokensPerSec,
        totalTokens: raw.promptTokensTotal + raw.tokensPredictedTotal,
        requestsProcessing: raw.requestsProcessing,
        requestsDeferred: raw.requestsDeferred,
        promptSecondsTotal: raw.promptSecondsTotal,
        tokensPredictedSecondsTotal: raw.tokensPredictedSecondsTotal,
        nDecodeTotal: raw.nDecodeTotal,
        nTokensMax: raw.nTokensMax,
      };
      setMetrics(m);
      setConnected(true);
      setLastPoll(Date.now());
    } catch {
      setConnected(false);
    }
  };

  React.useEffect(() => {
    poll();
    const cfg = configRef.current;
    const interval = (cfg?.dashboard?.pollIntervalMs ?? 2000);
    const id = setInterval(poll, interval);
    return () => clearInterval(id);
  }, []);

  const serverStatus = getStatus();
  const serverRunning = serverStatus.running;

  if (!serverRunning && !connected) {
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <Text bold color={theme.warning}>Server not running</Text>
        <Box marginTop={1}>
          <Text color={theme.textMuted}>Start the server from the</Text>
          <Text color={theme.accent}> [Server]</Text>
          <Text color={theme.textMuted}> tab to see live metrics.</Text>
        </Box>
      </Box>
    );
  }

  if (!metrics) {
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <Text bold color={theme.text}>Connecting to server...</Text>
        <Box marginTop={1}>
          <Text color={theme.textMuted}>Fetching initial stats</Text>
        </Box>
      </Box>
    );
  }

 
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text bold>Dashboard</Text>
        <Text color={theme.textMuted}>
          {lastPoll ? `Last update: ${new Date(lastPoll).toLocaleTimeString()}` : "—"}
          {" │ "}
          <Text color={connected ? theme.success : theme.danger}>
            {connected ? "● Connected" : "● Disconnected"}
          </Text>
        </Text>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" width={28} marginRight={2}>
          <Section title="Token Stats">
            <MetricRow label="gen t/s" value={metrics.predictedTokensPerSec.toFixed(1)} color={theme.success} />
            <MetricRow label="prompt t/s" value={metrics.promptTokensPerSec.toFixed(1)} />
            <MetricRow label="total tokens" value={metrics.totalTokens.toLocaleString()} />
            <MetricRow label="prompt time" value={formatDuration(metrics.promptSecondsTotal)} />
            <MetricRow label="gen time" value={formatDuration(metrics.tokensPredictedSecondsTotal)} />
          </Section>
        </Box>

        <Box flexDirection="column" width={28} marginRight={2}>
          <Section title="Processing">
            <MetricRow label="n_decode" value={metrics.nDecodeTotal.toLocaleString()} />
            <MetricRow label="n_tokens_max" value={metrics.nTokensMax.toLocaleString()} />
          </Section>
        </Box>

        <Box flexDirection="column" width={24}>
          <Section title="Queue">
            <MetricRow label="Processing" value={String(metrics.requestsProcessing)} color={metrics.requestsProcessing > 0 ? theme.success : theme.textMuted} />
            <MetricRow label="Deferred" value={String(metrics.requestsDeferred)} color={metrics.requestsDeferred > 0 ? theme.warning : theme.textMuted} />
          </Section>
        </Box>
      </Box>
    </Box>
  );
}
