import React from "react";
import { useInput, Text, Box } from "ink";
import { useOnClick } from "@ink-tools/ink-mouse";
import { theme } from "../lib/theme.js";

interface Props {
  tabs: readonly string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

export default function Tabs({ tabs, selectedIndex, onChange }: Props) {
  useInput((_, key) => {
    if (key.leftArrow) {
      const newIndex = selectedIndex > 0 ? selectedIndex - 1 : tabs.length - 1;
      onChange(newIndex);
    }
    if (key.rightArrow) {
      const newIndex = selectedIndex < tabs.length - 1 ? selectedIndex + 1 : 0;
      onChange(newIndex);
    }
  });

  return (
    <Box>
      {tabs.map((tab, i) => {
        const isActive = i === selectedIndex;
        const ref = React.useRef(null);

        useOnClick(ref, () => {
          onChange(i);
        });

        return (
          <Box key={tab} ref={ref}>
            <Text color={isActive ? theme.accent : theme.textMuted} bold={isActive}>
              {isActive ? "▸ " : "  "}{tab}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
