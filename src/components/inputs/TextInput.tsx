import React from "react";
import TextInput from "ink-text-input";
import { Box, Text } from "ink";
import { theme } from "../../lib/theme.js";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export default function TextInputField({ label, value, onChange }: Props) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accent}>{label}</Text>
      </Box>
      <Box>
        <TextInput value={value} onChange={onChange} />
      </Box>
    </Box>
  );
}
