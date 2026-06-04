import React from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { spawn } from "child_process";
import { onServerLog, serverLogLines, clearServerLogs, getStatus } from "../../lib/server.js";
import { theme } from "../../lib/theme.js";

const severityColor = (level: string): string => {
  const l = level.toUpperCase();
  if (l === "E" || l === "F") return theme.danger;
  if (l === "W") return theme.warning;
  if (l === "I") return theme.accent;
  if (l === "D" || l === "T") return theme.textMuted;
  return theme.text;
};

const parseLogLine = (line: string) => {
  // Format: "2.23.304.800 I slot print_timing: ..."
  const match = line.match(/^([\d.]+)\s+([A-Z])\s+(\S+)\s+(.*)$/);
  if (match) {
    return {
      timestamp: match[1],
      level: match[2],
      component: match[3],
      message: match[4],
    };
  }
  return {
    timestamp: null,
    level: null,
    component: null,
    message: line,
  };
};

export default function LiveLogsTab({ message, showMessage, setIsTextInputFocused }: { message: string | null; showMessage: (msg: string) => void; setIsTextInputFocused: (focused: boolean) => void }) {
  const [, setTick] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [scrollOffset, setScrollOffset] = React.useState(0);
  const { stdout } = useStdout();

  React.useEffect(() => {
    const unsub = onServerLog(() => {
      setTick((t) => t + 1);
    });
    return unsub;
  }, []);

  React.useEffect(() => {
    const interval = setInterval(async () => {
      const status = getStatus();
      setRunning(status.running);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = () => {
    if (serverLogLines.length === 0) return;
    const text = serverLogLines.join("\n");
    const xclip = spawn("xclip", ["-selection", "clipboard"]);
    xclip.stdin.write(text + "\n");
    xclip.stdin.end();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maxVisible = Math.max(1, stdout.rows - 5);

  useInput((input, key) => {
    if (key.upArrow || key.pageUp) {
      setAutoScroll(false);
      setScrollOffset((prev) => Math.max(0, prev - (key.pageUp ? maxVisible : 1)));
    }
    if (key.downArrow || key.pageDown) {
      setAutoScroll(false);
      setScrollOffset((prev) => Math.min(serverLogLines.length - maxVisible, prev + (key.pageDown ? maxVisible : 1)));
    }
    if (input === "G") {
      setAutoScroll(false);
      setScrollOffset(0);
    }
    if (input === "g") {
      setAutoScroll(true);
      setScrollOffset(0);
    }
    if (input === "u") {
      clearServerLogs();
      setScrollOffset(0);
      setTick((t) => t + 1);
    }
    if (input === "y") {
      copyToClipboard();
    }
  });

  const lines = serverLogLines;
  const visibleStart = autoScroll ? Math.max(0, lines.length - maxVisible) : scrollOffset;
  const visibleLines = lines.slice(visibleStart, visibleStart + maxVisible);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Box>
          <Text color={theme.text} bold>Live Logs</Text>
          <Text> {" │ "} </Text>
          <Text color={running ? theme.success : theme.danger}>
            {running ? "● Running" : "○ Stopped"}
          </Text>
        </Box>
        <Box>
          <Text color={theme.textMuted}>{lines.length} lines</Text>
          <Text> {" │ "} </Text>
          <Text color={autoScroll ? theme.success : theme.textMuted}>
            {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.textMuted} wrap="wrap">
          g auto-scroll │ G top │ u clear │ y copy │ arrows scroll
        </Text>
        {copied && (
          <Text color={theme.success}> {" │ Copied to clipboard!"}</Text>
        )}
      </Box>

      <Box
        flexDirection="column"
        flexGrow={1}
        marginTop={1}
        borderStyle="single"
        borderColor={theme.border}
      >
        {lines.length === 0 ? (
          <Box>
            <Text color={theme.textMuted}>Waiting for server output...</Text>
          </Box>
        ) : (
          visibleLines.map((line, i) => {
            const { timestamp, level, component, message } = parseLogLine(line);
            return (
              <Box key={visibleStart + i}>
                <Text color={theme.textMuted}>{"› "}</Text>
                {timestamp && (
                  <Text color={theme.textMuted}>{timestamp}</Text>
                )}
                {timestamp && <Text>{" "}</Text>}
                {level && (
                  <Text color={severityColor(level)} bold>{level}</Text>
                )}
                {level && <Text>{" "}</Text>}
                {component && (
                  <Text color={theme.textMuted}>{component}</Text>
                )}
                {component && <Text>{" "}</Text>}
                <Text color={theme.text} wrap="truncate">{message}</Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
