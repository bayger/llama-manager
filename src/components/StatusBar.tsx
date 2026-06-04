import React from "react";
import { Box, Text } from "ink";
import { theme } from "../lib/theme.js";

interface Props {
  activeTab: string;
  message: string | null;
}

export default function StatusBar({ activeTab, message }: Props) {
  return (
    <Box width="100%">
      {message
        ? <><Text color={theme.success}>{message}</Text><Text color={theme.textMuted}> | ? help</Text></>
        : <Text color={theme.textMuted}>{activeTab} | F1-F7 navigate | q quit | ? help</Text>}
    </Box>
  );
}
