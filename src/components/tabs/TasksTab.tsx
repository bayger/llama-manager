import React from "react";
import { Box, Text } from "ink";
import { theme } from "../../lib/theme.js";

export default function TasksTab() {
  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text bold>Tasks</Text>
      </Box>
      <Box>
        <Text color={theme.textMuted}>(coming soon)</Text>
      </Box>
    </Box>
  );
}
