import React from "react";
import { Box, Text } from "ink";
import { theme } from "../../lib/theme.js";

export default function DashboardTab() {
  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text bold>Dashboard</Text>
      </Box>
      <Box>
        <Text color={theme.textMuted}>(coming soon)</Text>
      </Box>
    </Box>
  );
}
