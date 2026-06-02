import React from "react";
import { Box, Text } from "ink";

export default function VersionsTab() {
  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text bold>Versions</Text>
      </Box>
      <Box>
        <Text color="gray">(coming soon)</Text>
      </Box>
    </Box>
  );
}
