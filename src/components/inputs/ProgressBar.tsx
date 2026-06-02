import React from "react";
import { Text, Box } from "ink";

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
      {label && <Text color="cyan">{label}: </Text>}
      <Text color="cyan">{bar}</Text>
      <Text color="gray"> {Math.round(progress)}%</Text>
    </Box>
  );
}
