import React from "react";
import { Box, Text } from "ink";
import { theme } from "../lib/theme.js";

interface Props {
  activeTab: string;
}

export default function StatusBar({ activeTab }: Props) {
  return (
    <Box width="100%">
      <Text color={theme.textMuted}>
        {activeTab} | F1-F7 navigate | q quit | ? help
      </Text>
    </Box>
  );
}
