import React from "react";
import { Box, Text } from "ink";

interface Props {
  activeTab: string;
}

export default function StatusBar({ activeTab }: Props) {
  return (
    <Box width="100%">
      <Text color="gray">
        {activeTab} | ← → navigate | q quit | ? help
      </Text>
    </Box>
  );
}
