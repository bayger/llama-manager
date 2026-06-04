import React from "react";
import { Text, Box } from "ink";
import { theme } from "../../lib/theme.js";

interface Props {
  progress: number;
  label?: string;
}

export default function ProgressBar({ progress, label }: Props) {
  const width = 30;
  const filled = Math.round((progress / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);

  return (
    <Box>
      {label && <Text color={theme.accent}>{label}: </Text>}
      <Text color={theme.accent}>{bar}</Text>
      <Text color={theme.textMuted}> {Math.round(progress)}%</Text>
    </Box>
  );
}
