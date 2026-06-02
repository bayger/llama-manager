import React from "react";
import { Box, Text } from "ink";

export default function ServerTab() {
  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text bold>Server</Text>
      </Box>
      <Box>
        <Text color="gray">Status: Stopped</Text>
      </Box>
      <Box>
        <Text color="gray">(coming soon)</Text>
      </Box>
    </Box>
  );
}
