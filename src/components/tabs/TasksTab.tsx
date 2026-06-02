import React from "react";
import { Box, Text } from "ink";

export default function TasksTab() {
  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text bold>Tasks</Text>
      </Box>
      <Box>
        <Text color="gray">(coming soon)</Text>
      </Box>
    </Box>
  );
}
